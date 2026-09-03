<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { isElectron as inDesktopShell } from "@/utils/electron";

const isElectron = inDesktopShell();

const localPort = ref("19580");
const localToken = ref("");
const remoteEnabled = ref(false);
const serviceStatus = ref("未知");
const saving = ref(false);

async function loadSettings() {
  if (!window.electronAPI) {
    serviceStatus.value = "浏览器模式（被控设置需 Electron 桌面版）";
    return;
  }

  try {
    const settings = await window.electronAPI.getServiceSettings();
    localPort.value = String(settings.port ?? 19580);
    localToken.value = settings.apiToken ?? "";
    remoteEnabled.value = !!settings.remoteAccessEnabled;

    const status = await window.electronAPI.getServiceStatus();
    if (status.running) {
      serviceStatus.value = `运行中 · PID ${status.pid ?? "-"}`;
    } else {
      serviceStatus.value = "未运行";
    }
  } catch (e) {
    serviceStatus.value = e instanceof Error ? e.message : "读取失败";
  }
}

async function saveSettings() {
  if (!window.electronAPI) {
    ElMessage.warning("被控设置仅在 Electron 桌面版可用");
    return;
  }

  const port = parseInt(localPort.value, 10);
  if (Number.isNaN(port) || port < 1024 || port > 65535) {
    ElMessage.error("端口无效（1024–65535）");
    return;
  }

  saving.value = true;
  try {
    await window.electronAPI.saveServiceSettings({
      port,
      host: "127.0.0.1",
      apiToken: localToken.value.trim(),
      remoteAccessEnabled: remoteEnabled.value,
    });
    const status = await window.electronAPI.restartService();
    if (status.running) {
      serviceStatus.value = `运行中 · PID ${status.pid ?? "-"}`;
    } else {
      serviceStatus.value = "启动失败，请检查 build:service";
    }
    ElMessage.success("设置已保存，Service 已重启");
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

onMounted(loadSettings);
</script>

<template>
  <ConsolePageLayout :padded="false">
    <div class="host-settings-inner">
      <div class="host-settings-header">被控服务</div>
      <p class="hint">
      配置 Node.js 被控服务（@a3st/service）的 HTTP 监听参数。修改后会自动重启 Service。
    </p>

    <el-alert
      v-if="!isElectron"
      type="info"
      show-icon
      :closable="false"
      title="当前为 Web 模式"
      description="被控端需通过 npm run dev:service 或 Electron 桌面版启动。"
      style="margin-bottom: 12px;"
    />

    <el-card>
      <el-form label-width="120px">
        <el-form-item label="Service 状态">
          <span>{{ serviceStatus }}</span>
        </el-form-item>

        <el-form-item label="HTTP 端口">
          <el-input v-model="localPort" style="width: 160px;" />
          <span class="field-hint">默认 19580</span>
        </el-form-item>

        <el-form-item label="API Token">
          <el-input v-model="localToken" type="password" show-password style="width: 320px;" />
        </el-form-item>

        <el-form-item label="允许远程控制">
          <el-switch v-model="remoteEnabled" />
          <span class="field-hint">开启后监听 0.0.0.0，外部可连接</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveSettings">保存并重启 Service</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    </div>
  </ConsolePageLayout>
</template>

<style scoped>
.host-settings-inner {
  padding: 10px 12px;
  max-width: 560px;
}

.host-settings-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--a3st-text-muted);
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 8px 0 16px;
}

.field-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
