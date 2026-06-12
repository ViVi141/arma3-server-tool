<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useRouter } from "vue-router";
import type { AsyncTaskResponse } from "@a3st/api-client";

const props = defineProps<{ connectionId: string }>();
const store = useConnectionsStore();
const router = useRouter();

const step = ref(0);
const serverDir = ref("C:\\arma3_server");
const configName = ref("我的服务器");
const workshopIds = ref("");
const creating = ref(false);
const progress = ref("");
const progressPercent = ref(0);
const serverUuid = ref("");

const steps = [
  "配置服务器目录",
  "设置基础参数",
  "下载服务器文件",
  "配置模组",
  "启动服务器",
  "完成",
];

async function submitAsyncTask(
  commands: { action: string; modIds?: number[]; writeCfgAfter?: boolean }[],
  label: string
): Promise<boolean> {
  const client = store.getClient();
  if (!client) {
    return false;
  }

  const res = await client.submitTask({
    serverUuid: serverUuid.value,
    async: true,
    commands: commands as never,
  });
  const taskId = (res.data as AsyncTaskResponse).taskId;
  if (!taskId) {
    throw new Error(`${label}：未收到任务 ID`);
  }

  progress.value = `${label}：执行中…`;
  const finalTask = await client.pollTask(taskId, 2000, 900000);
  if (finalTask.status !== "Succeeded") {
    throw new Error(finalTask.error ?? `${label} 失败`);
  }

  const stepsDone = finalTask.data?.steps ?? [];
  const last = stepsDone[stepsDone.length - 1];
  progress.value = last?.message ?? `${label} 完成`;
  return true;
}

async function createAndSetup() {
  creating.value = true;
  progressPercent.value = 10;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }

    step.value = 2;
    progress.value = "正在创建服务器配置…";
    const createRes = await client.createServer(configName.value, serverDir.value);
    if (!createRes.success) {
      throw new Error(createRes.error ?? "创建配置失败");
    }
    serverUuid.value = createRes.data.uuid;

    await client.patchConfig(serverUuid.value, {
      server: { serverDir: serverDir.value, configName: configName.value },
    } as never);

    progressPercent.value = 30;
    step.value = 2;
    await submitAsyncTask([{ action: "update_server" }], "下载/更新服务器文件");

    progressPercent.value = 55;
    step.value = 3;
    const ids = workshopIds.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n) && n > 0);
    if (ids.length > 0) {
      await submitAsyncTask([
        { action: "enable_mods", modIds: ids, writeCfgAfter: false },
        { action: "download_mods", modIds: ids },
      ], "下载模组");
    } else {
      progress.value = "跳过模组配置";
    }

    progressPercent.value = 75;
    step.value = 4;
    await client.submitTask({
      serverUuid: serverUuid.value,
      commands: [{ action: "write_cfg" as const }],
    });
    progress.value = "配置已写入";

    progressPercent.value = 90;
    const startRes = await client.submitTask({
      serverUuid: serverUuid.value,
      commands: [{ action: "start" as const }],
    });
    const startData = startRes.data as { success?: boolean; message?: string; steps?: { message: string }[] };
    if (startData?.success === false) {
      throw new Error(startData.message ?? "启动失败");
    }
    progress.value = "服务器已启动";
    progressPercent.value = 100;
    step.value = 5;
    ElMessage.success("部署完成");
  } catch (e: unknown) {
    progress.value = e instanceof Error ? e.message : "设置失败";
    ElMessage.error(progress.value);
  } finally {
    creating.value = false;
  }
}

function goToServer() {
  if (serverUuid.value) {
    router.push(`/console/${props.connectionId}/dashboard`);
  }
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

    <el-card v-if="step >= 2 && step < 5">
      <h3>{{ steps[step] }}</h3>
      <el-progress :percentage="progressPercent" :stroke-width="12" />
      <p style="margin-top: 8px; color: var(--el-text-color-secondary);">{{ progress }}</p>
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
