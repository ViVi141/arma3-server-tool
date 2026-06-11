<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useConnectionsStore } from "@/stores/connections";
import { useRouter } from "vue-router";

const props = defineProps<{ connectionId: string }>();
const store = useConnectionsStore();
const router = useRouter();

// Wizard steps
const step = ref(0);
const serverDir = ref("C:\\arma3_server");
const configName = ref("我的服务器");
const workshopIds = ref("");
const creating = ref(false);
const progress = ref("");
const serverUuid = ref("");

const steps = [
  "配置服务器目录",
  "设置基础参数",
  "下载服务器文件",
  "配置模组",
  "启动服务器",
  "完成",
];

async function createAndSetup() {
  creating.value = true;
  step.value = 2;
  try {
    const client = store.getClient();
    if (!client) return;

    // 1. Create server config
    const res = await fetch(`${store.active?.baseUrl}/api/v1/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configName: configName.value, serverDir: serverDir.value }),
    });
    const data = (await res.json()).data;
    serverUuid.value = data.uuid;
    progress.value = "服务器配置已创建";
    step.value = 1;

    // 2. Setup basic config
    step.value = 2;
    progress.value = "正在下载服务器文件...";
    const updateRes = await fetch(`${store.active?.baseUrl}/api/v1/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverUuid: serverUuid.value, commands: [{ action: "update_server" }] }),
    });
    progress.value = "服务器文件下载已排队";

    // 3. Configure mods
    step.value = 3;
    const ids = workshopIds.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number);
    if (ids.length > 0) {
      await fetch(`${store.active?.baseUrl}/api/v1/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUuid: serverUuid.value, async: true, commands: [{ action: "enable_mods", modIds: ids }] }),
      });
    }

    // 4. Write config
    step.value = 4;
    await fetch(`${store.active?.baseUrl}/api/v1/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverUuid: serverUuid.value, commands: [{ action: "write_cfg" }] }),
    });
    progress.value = "配置已写入";

    // 5. Start server
    step.value = 4;
    await fetch(`${store.active?.baseUrl}/api/v1/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverUuid: serverUuid.value, commands: [{ action: "start" }] }),
    });
    progress.value = "服务器已启动";

    step.value = 5;
  } catch (e: unknown) { progress.value = e instanceof Error ? e.message : "设置失败"; }
  finally { creating.value = false; }
}

function goToServer() {
  router.push(`/console/${props.connectionId}/dashboard`);
}
</script>

<template>
  <div class="wizard-page">
    <h2>首次开服向导</h2>

    <el-steps :active="step" simple style="margin: 16px 0;">
      <el-step v-for="(s, i) in steps" :key="i" :title="s" />
    </el-steps>

    <el-card v-if="step === 0">
      <el-form label-width="140px">
        <el-form-item label="配置名称">
          <el-input v-model="configName" placeholder="我的服务器" />
        </el-form-item>
        <el-form-item label="服务器目录">
          <el-input v-model="serverDir" placeholder="C:\\arma3_server" />
        </el-form-item>
        <el-form-item label="Workshop ID">
          <el-input v-model="workshopIds" type="textarea" :rows="2" placeholder="450814997, 463939057（可选）" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="step = 1">下一步</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="step === 1">
      <h3>确认配置</h3>
      <p><strong>名称:</strong> {{ configName }}</p>
      <p><strong>目录:</strong> {{ serverDir }}</p>
      <p><strong>模组:</strong> {{ workshopIds || '(无)' }}</p>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <el-button @click="step = 0">上一步</el-button>
        <el-button type="primary" :loading="creating" @click="createAndSetup">开始部署</el-button>
      </div>
    </el-card>

    <el-card v-if="step === 2">
      <h3>下载 SteamCMD 和服务器文件</h3>
      <p>此步骤可能需要几分钟...</p>
      <el-progress :percentage="50" :stroke-width="12" indeterminate />
      <p style="margin-top: 8px; color: var(--el-text-color-secondary);">{{ progress }}</p>
    </el-card>

    <el-card v-if="step === 3">
      <h3>配置模组</h3>
      <el-progress :percentage="75" :stroke-width="12" indeterminate />
      <p style="margin-top: 8px; color: var(--el-text-color-secondary);">{{ progress }}</p>
    </el-card>

    <el-card v-if="step === 4">
      <h3>写入配置并启动</h3>
      <el-progress :percentage="90" :stroke-width="12" indeterminate />
      <p style="margin-top: 8px;">{{ progress }}</p>
    </el-card>

    <el-card v-if="step === 5">
      <el-result icon="success" title="服务器部署完成!" :sub-title="`${configName} 已就绪`">
        <template #extra>
          <el-button type="primary" @click="goToServer">进入服务器仪表盘</el-button>
        </template>
      </el-result>
    </el-card>
  </div>
</template>
