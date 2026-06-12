<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import TerminalOutput from "@/components/TerminalOutput.vue";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const baseUrl = ref(store.active?.baseUrl ?? "");

const steamUser = ref("");
const steamPwd = ref("");
const workshopRoot = ref("");
const serverInstallPath = ref("");
const statusText = ref("安装: - · 运行: -");
const workshopCount = ref("-");
const currentServerDir = ref("");

onMounted(() => { loadStatus(); loadConfig(); });

async function loadConfig() {
  try {
    const client = store.getClient(); if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data as Record<string, unknown>;
      currentServerDir.value = ((cfg.server as Record<string, unknown>)?.serverDir as string) ?? "-";
    }
  } catch { /* ignore */ }
}

async function downloadSteamCmd() {
  try {
    ElMessage.info("下载 SteamCMD 已排队");
    await doTask("update_server");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "失败"); }
}

async function installDedicatedServer() {
  try {
    ElMessage.info("安装/更新专用服务器已排队");
    await doTask("update_server");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "失败"); }
}

async function doTask(action: string) {
  const client = store.getClient(); if (!client) return;
  await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
}

async function checkSteamCmd() {
  try {
    const client = store.getClient(); if (!client) return;
    const res = await client.steamCmdStatus();
    const data = res.data as { isInstalled?: boolean; isRunning?: boolean };
    statusText.value = `安装: ${data.isInstalled} · 运行: ${data.isRunning}`;
  } catch (e: unknown) { statusText.value = `安装: - · 运行: -`; }
}

async function saveCredentials() {
  try {
    const client = store.getClient(); if (!client) return;
    await fetch(`${baseUrl.value}/api/v1/steamcmd/credentials`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: steamUser.value, password: steamPwd.value }),
    });
    statusText.value = "凭据已设置";
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "失败"); }
}

async function loadStatus() { await checkSteamCmd(); }

async function stopSteamCmd() {
  try { const client = store.getClient(); if (!client) return; await client.stopSteamCmd(); statusText.value = "已停止"; }
  catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "停止失败"); }
}
</script>
<template>
<div class="page">
<div class="toolbar">
  <el-button size="small" @click="downloadSteamCmd">下载 SteamCMD</el-button>
  <el-button size="small" type="primary" @click="installDedicatedServer">安装/更新专用服务器</el-button>
  <el-button size="small" @click="stopSteamCmd" style="margin-left:auto;">停止 SteamCMD</el-button>
  <el-button size="small" @click="checkSteamCmd">刷新状态</el-button>
</div>
<div class="body">
  <fieldset><legend>Steam 账号</legend>
    <div class="row"><label>用户名</label><el-input v-model="steamUser" size="small"/></div>
    <div class="row"><label>密码</label><el-input v-model="steamPwd" type="password" size="small" show-password/></div>
    <el-button size="small" @click="saveCredentials">保存凭据</el-button>
  </fieldset>
  <fieldset><legend>路径</legend>
    <div class="row"><label>Workshop 根</label><el-input v-model="workshopRoot" size="small" placeholder="留空使用默认"/></div>
    <div class="row"><label>服务器安装</label><el-input v-model="serverInstallPath" size="small" placeholder="从基本配置读取"/></div>
    <div class="row"><label>Workshop 内容</label><span style="font-size:12px;color:var(--el-text-color-secondary)">{{workshopCount}} 个模组</span></div>
    <div class="row"><label>SteamCMD 状态</label><span style="font-size:12px;">{{statusText}}</span></div>
  </fieldset>
  <fieldset><legend>当前服务器</legend>
    <div class="row"><label>服务器目录</label><span style="font-size:12px;">{{currentServerDir}}</span></div>
    <div class="row"><label>操作</label>
      <el-button size="small" @click="doTask('update_server')">更新服务器文件</el-button>
      <el-button size="small" @click="doTask('download_mods')">下载模组</el-button>
    </div>
  </fieldset>
  <fieldset><legend>输出流</legend>
    <TerminalOutput url="/api/v1/steamcmd/stream" :base-url="baseUrl" />
  </fieldset>
</div></div>
</template>
<style scoped>
.page{height:100%;display:flex;flex-direction:column}
.toolbar{padding:4px 8px;display:flex;gap:4px;border-bottom:1px solid var(--el-border-color);flex-shrink:0;flex-wrap:wrap}
.body{flex:1;overflow-y:auto;padding:8px}
fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}
legend{font-size:12px;font-weight:600;padding:0 4px}
.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.row label{width:120px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}
</style>
