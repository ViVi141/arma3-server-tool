<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerSummary, ServerStatus } from "@a3st/api-client";

const route = useRoute();
const router = useRouter();
const store = useConnectionsStore();

const connectionId = () => route.params.connectionId as string;

const servers = ref<ServerSummary[]>([]);
const selectedUuid = ref("");
const loading = ref(false);
const searchText = ref("");

const status = ref<ServerStatus | null>(null);
const isRunning = ref(false);
const statusText = ref("已停止");

// One flat tab bar — no nesting
const activeTab = ref("dashboard");
const tabs = [
  { name: "dashboard", label: "概览" },
  { name: "basic", label: "基本" },
  { name: "performance", label: "性能" },
  { name: "network", label: "网络" },
  { name: "difficulty", label: "难度" },
  { name: "security", label: "安全" },
  { name: "log", label: "日志" },
  { name: "mods", label: "模组" },
  { name: "rcon", label: "RCon" },
  { name: "bans", label: "封禁" },
  { name: "steamcmd", label: "SteamCMD" },
  { name: "statistics", label: "统计" },
  { name: "missions", label: "任务" },
  { name: "snapshots", label: "快照" },
  { name: "logs", label: "日志查看" },
  { name: "preflight", label: "体检" },
  { name: "wizard", label: "向导" },
  { name: "about", label: "关于" },
];

onMounted(() => { store.setActive(connectionId()); loadServers(); });
watch(() => route.params.connectionId, () => { store.setActive(connectionId()); loadServers(); });

async function loadServers() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    servers.value = await client.listServers();
    if (servers.value.length > 0 && !selectedUuid.value) selectServer(servers.value[0].uuid);
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

async function selectServer(uuid: string) {
  selectedUuid.value = uuid;
  if (uuid) await refreshStatus();
}

async function refreshStatus() {
  if (!selectedUuid.value) return;
  try {
    const client = store.getClient();
    if (!client) return;
    status.value = await client.serverStatus(selectedUuid.value);
    isRunning.value = status.value.isRunning;
    statusText.value = status.value.isRunning ? `运行中 · PID ${status.value.pid}` : "已停止";
  } catch { /* ignore */ }
}

async function execAction(action: string) {
  if (!selectedUuid.value) return;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: selectedUuid.value, commands: [{ action: action as never }] });
    const d = res.data as { success?: boolean; message?: string } | undefined;
    ElMessage[d?.success ? "success" : "warning"](d?.message ?? (action === "start" ? "已启动" : action === "stop" ? "已停止" : "已重启"));
    await refreshStatus();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}
</script>

<template>
  <div class="main-layout">
    <!-- Left: server list -->
    <aside class="server-panel">
      <div class="panel-header">
        <span class="panel-title">服务器</span>
        <el-button size="small" @click="$router.push('/connections')" text>←</el-button>
      </div>
      <el-input v-model="searchText" placeholder="搜索..." size="small" clearable style="padding: 4px 8px;" />
      <div class="server-list" v-loading="loading">
        <div v-for="s in servers.filter(s => !searchText || s.configName.toLowerCase().includes(searchText.toLowerCase()))"
          :key="s.uuid"
          :class="['server-item', { active: s.uuid === selectedUuid }]"
          @click="selectServer(s.uuid)">
          <div class="server-name">{{ s.configName }}</div>
        </div>
        <el-empty v-if="!loading && servers.length === 0" description="无服务器，← 返回创建" :image-size="36" />
      </div>
    </aside>

    <!-- Right: main area -->
    <div class="main-area">
      <!-- Top action bar -->
      <div class="action-bar">
        <div class="action-left">
          <el-button size="small" type="success" :disabled="isRunning" @click="execAction('start')">▶ 启动</el-button>
          <el-button size="small" type="warning" :disabled="!isRunning" @click="execAction('restart')">⟳ 重启</el-button>
          <el-button size="small" type="danger" :disabled="!isRunning" @click="execAction('stop')">■ 停止</el-button>
          <span class="sep" />
          <el-button size="small" @click="execAction('save')">💾 保存</el-button>
          <el-button size="small" @click="execAction('write_cfg')">📝 写入服务器</el-button>
          <el-button size="small" @click="execAction('preflight')">🔍 体检</el-button>
        </div>
        <div class="action-right">
          <span class="status-badge" :class="isRunning ? 'green' : 'red'">{{ statusText }}</span>
        </div>
      </div>

      <!-- Tab bar -->
      <el-tabs v-model="activeTab" class="main-tabs" @tab-click="() => 0">
        <el-tab-pane v-for="tab in tabs" :key="tab.name" :label="tab.label" :name="tab.name">
          <div class="tab-content" v-if="selectedUuid">
            <DashboardView v-if="tab.name === 'dashboard'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <BasicSettings v-else-if="tab.name === 'basic'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <PerformanceView v-else-if="tab.name === 'performance'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <NetworkView v-else-if="tab.name === 'network'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <DifficultyView v-else-if="tab.name === 'difficulty'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <SecurityView v-else-if="tab.name === 'security'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <LogSettingsView v-else-if="tab.name === 'log'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <ModsView v-else-if="tab.name === 'mods'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <RconView v-else-if="tab.name === 'rcon'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <BansView v-else-if="tab.name === 'bans'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <MissionsView v-else-if="tab.name === 'missions'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <SteamCmdView v-else-if="tab.name === 'steamcmd'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <StatisticsView v-else-if="tab.name === 'statistics'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <SnapshotsView v-else-if="tab.name === 'snapshots'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <LogsView v-else-if="tab.name === 'logs'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <PreflightView v-else-if="tab.name === 'preflight'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <SetupWizardView v-else-if="tab.name === 'wizard'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
            <AboutView v-else-if="tab.name === 'about'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- Status bar -->
      <div class="status-bar">
        <span>服务器目录: -</span>
        <span>Arma3 Server Tools v2.0.0</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import DashboardView from "./DashboardView.vue";
import BasicSettings from "./BasicSettings.vue";
import PerformanceView from "./PerformanceView.vue";
import NetworkView from "./NetworkView.vue";
import DifficultyView from "./DifficultyView.vue";
import SecurityView from "./SecurityView.vue";
import LogSettingsView from "./LogSettingsView.vue";
import ModsView from "./ModsView.vue";
import RconView from "./RconView.vue";
import BansView from "./BansView.vue";
import MissionsView from "./MissionsView.vue";
import SteamCmdView from "./SteamCmdView.vue";
import StatisticsView from "./StatisticsView.vue";
import SnapshotsView from "./SnapshotsView.vue";
import LogsView from "./LogsView.vue";
import PreflightView from "./PreflightView.vue";
import SetupWizardView from "./SetupWizardView.vue";
import AboutView from "./AboutView.vue";
</script>

<style scoped>
.main-layout { display: flex; height: 100%; }
.server-panel { width: 200px; min-width: 160px; border-right: 1px solid var(--el-border-color); display: flex; flex-direction: column; background: #f5f7fa; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; }
.panel-title { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.server-list { flex: 1; overflow-y: auto; padding: 4px; }
.server-item { padding: 5px 8px; cursor: pointer; border-radius: 2px; margin-bottom: 1px; font-size: 12px; }
.server-item:hover { background: #e8eaed; }
.server-item.active { background: #409eff; color: white; }
.server-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.action-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #fafafa; border-bottom: 1px solid var(--el-border-color); flex-shrink: 0; }
.action-left { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.sep { width: 1px; height: 18px; background: var(--el-border-color); margin: 0 4px; }
.action-right { display: flex; align-items: center; }
.status-badge { font-size: 11px; padding: 2px 8px; border-radius: 2px; }
.status-badge.green { background: #e1f3d8; color: #67c23a; }
.status-badge.red { background: #fde2e2; color: #f56c6c; }
.main-tabs { flex: 1; display: flex; flex-direction: column; }
.main-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 8px; flex-shrink: 0; }
.main-tabs :deep(.el-tabs__content) { flex: 1; overflow: auto; padding: 0; }
.main-tabs :deep(.el-tab-pane) { height: 100%; }
.tab-content { height: 100%; }
.status-bar { display: flex; align-items: center; justify-content: space-between; padding: 2px 10px; background: #f5f7fa; border-top: 1px solid var(--el-border-color); font-size: 11px; color: #909399; flex-shrink: 0; }
</style>
