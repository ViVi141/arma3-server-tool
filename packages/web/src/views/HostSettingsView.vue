<script setup lang="ts">
import { ref } from "vue";

const localPort = ref("19580");
const localToken = ref("");
const remoteEnabled = ref(false);
const saved = ref(false);

function saveSettings() {
  // In the real Electron app, this would call Main process IPC
  // to update the Service settings.json and restart Service.
  saved.value = true;
  setTimeout(() => {
    saved.value = false;
  }, 2000);
}
</script>

<template>
  <div class="host-settings-page">
    <h2>被控设置</h2>
    <p style="font-size: 13px; color: var(--el-text-color-secondary); margin: 8px 0 16px;">
      配置 Arma3ServerTools.Service 的 HTTP 监听参数。修改后需重启 Service。
    </p>

    <el-card>
      <el-form label-width="120px">
        <el-form-item label="HTTP 端口">
          <el-input v-model="localPort" style="width: 160px;" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--el-text-color-secondary);">
            默认 19580
          </span>
        </el-form-item>

        <el-form-item label="API Token">
          <el-input v-model="localToken" type="password" show-password style="width: 320px;" />
        </el-form-item>

        <el-form-item label="允许远程控制">
          <el-switch v-model="remoteEnabled" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--el-text-color-secondary);">
            开启后外部可连接此 Service
          </span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存设置</el-button>
          <el-tag v-if="saved" type="success" style="margin-left: 8px;">已保存</el-tag>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
