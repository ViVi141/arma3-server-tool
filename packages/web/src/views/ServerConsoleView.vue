<script setup lang="ts">
import { ref, onMounted, watch, computed, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useUiSettingsStore } from "@/stores/uiSettings";
import { useConfigSessionStore } from "@/stores/configSession";
import { navGroups, resolveTabName } from "@/config/tab-registry";
import { openPath, isElectron } from "@/utils/electron";
import { CONFIG_EDITOR_KEY, type ConfigEditorRegistration } from "@/composables/configEditor";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog.vue";
import type { ServerSummary, ServerStatus, ServerSyncState } from "@a3st/api-client";

const route = useRoute();
const router = useRouter();
const store = useConnectionsStore();
const uiSettings = useUiSettingsStore();
const configSession = useConfigSessionStore();
const unsavedDialog = ref<InstanceType<typeof UnsavedChangesDialog> | null>(null);
const activeEditor = ref<ConfigEditorRegistration | null>(null);

provide(CONFIG_EDITOR_KEY, {
  register(registration: ConfigEditorRegistration | null) {
    activeEditor.value = registration;
  },
  onSaved() {
    refreshSyncState();
  },
});

const connectionId = () => route.params.connectionId as string;

const servers = ref<ServerSummary[]>([]);
const selectedUuid = ref("");
const loading = ref(false);
const searchText = ref("");

const status = ref<ServerStatus | null>(null);
const syncState = ref<ServerSyncState | null>(null);
const isRunning = ref(false);
const statusText = ref("已停止");

const groups = computed(() => navGroups());

const activeTab = ref("dashboard");

const selectedServer = computed(() => {
  return servers.value.find((s) => s.uuid === selectedUuid.value) ?? null;
});

const statusBarDir = computed(() => {
  if (selectedServer.value?.serverDir) {
    return selectedServer.value.serverDir;
  }
  return "-";
});

const syncStatusText = computed(() => {
  if (configSession.isDirty(selectedUuid.value)) {
    const label = activeEditor.value?.label ?? "当前页";
    return `${label} · 未保存`;
  }
  if (syncState.value?.cfgStale) {
    return "需写入服务器";
  }
  if (syncState.value?.cfgWritten) {
    return "已同步";
  }
  return "未写入 cfg";
});

const hasDirtyChanges = computed(() => {
  if (!selectedUuid.value) {
    return false;
  }
  return configSession.isDirty(selectedUuid.value);
});

onMounted(async () => {
  store.setActive(connectionId());
  const client = store.getClient();
  if (client) {
    await uiSettings.loadFromApi(client);
  }
  activeTab.value = resolveTabName(route.params.tab);
  await loadServers();
});

watch(() => route.params.connectionId, async () => {
  store.setActive(connectionId());
  selectedUuid.value = "";
  configSession.clearAll();
  await loadServers();
});

watch(
  () => route.params.tab,
  (tab) => {
    activeTab.value = resolveTabName(tab);
  }
);

watch(activeTab, (tab) => {
  const expected = `/console/${connectionId()}/${tab}`;
  if (route.path !== expected) {
    router.replace({ path: expected });
  }
});

async function loadServers() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    servers.value = await client.listServers();
    const stillExists = servers.value.some((s) => s.uuid === selectedUuid.value);
    if (!stillExists) {
      selectedUuid.value = "";
    }
    if (servers.value.length > 0 && !selectedUuid.value) {
      await selectServer(servers.value[0].uuid);
    }
  } catch {
    /* ignore */
  } finally {
    loading.value = false;
  }
}

async function confirmLeaveCurrent(): Promise<boolean> {
  if (!selectedUuid.value || !configSession.isDirty(selectedUuid.value)) {
    return true;
  }
  const dialog = unsavedDialog.value;
  if (!dialog) {
    return true;
  }
  const action = await dialog.open();
  if (action === "cancel") {
    return false;
  }
  if (action === "discard") {
    if (activeEditor.value) {
      await activeEditor.value.discard();
    } else {
      configSession.markClean(selectedUuid.value);
    }
    return true;
  }
  if (activeEditor.value?.isDirty()) {
    const ok = await activeEditor.value.save();
    if (!ok) {
      return false;
    }
    return true;
  }
  configSession.markClean(selectedUuid.value);
  return true;
}

async function navigateToTab(next: string): Promise<void> {
  if (next === activeTab.value) {
    return;
  }
  const ok = await confirmLeaveCurrent();
  if (!ok) {
    return;
  }
  activeTab.value = next;
}

async function createServer() {
  try {
    const { value: name } = await ElMessageBox.prompt("请输入配置名称", "新建服务器", {
      confirmButtonText: "创建",
      cancelButtonText: "取消",
    });
    if (!name?.trim()) {
      return;
    }
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.createServer(name.trim());
    if (!res.success) {
      throw new Error(res.error ?? "创建失败");
    }
    await loadServers();
    await selectServer(res.data.uuid);
    ElMessage.success("服务器已创建");
  } catch (e: unknown) {
    if (e === "cancel") {
      return;
    }
    ElMessage.error(e instanceof Error ? e.message : "创建失败");
  }
}

async function renameServer() {
  if (!selectedUuid.value) {
    return;
  }
  try {
    const current = selectedServer.value?.configName ?? "";
    const { value: name } = await ElMessageBox.prompt("请输入新名称", "重命名", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      inputValue: current,
    });
    if (!name?.trim()) {
      return;
    }
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.renameServer(selectedUuid.value, name.trim());
    await loadServers();
    ElMessage.success("已重命名");
  } catch (e: unknown) {
    if (e === "cancel") {
      return;
    }
    ElMessage.error(e instanceof Error ? e.message : "重命名失败");
  }
}

async function cloneServer() {
  if (!selectedUuid.value) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.cloneServer(selectedUuid.value);
    if (!res.success) {
      throw new Error(res.error ?? "复制失败");
    }
    await loadServers();
    await selectServer(res.data.uuid);
    ElMessage.success("已复制为新配置");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "复制失败");
  }
}

async function deleteServer() {
  if (!selectedUuid.value) {
    return;
  }
  try {
    await ElMessageBox.confirm("确定删除此服务器配置？（不会删除游戏文件）", "删除确认", { type: "warning" });
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.deleteServer(selectedUuid.value);
    selectedUuid.value = "";
    configSession.clearAll();
    await loadServers();
    ElMessage.success("已删除");
  } catch (e: unknown) {
    if (e === "cancel") {
      return;
    }
    ElMessage.error(e instanceof Error ? e.message : "删除失败");
  }
}

async function selectServer(uuid: string) {
  if (uuid === selectedUuid.value) {
    return;
  }
  const ok = await confirmLeaveCurrent();
  if (!ok) {
    return;
  }
  selectedUuid.value = uuid;
  if (uuid) {
    await refreshStatus();
    await refreshSyncState();
  }
}

async function refreshStatus() {
  if (!selectedUuid.value) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    status.value = await client.serverStatus(selectedUuid.value);
    isRunning.value = status.value.isRunning;
    statusText.value = status.value.isRunning ? `运行中 · PID ${status.value.pid}` : "已停止";
  } catch {
    /* ignore */
  }
}

async function refreshSyncState() {
  if (!selectedUuid.value) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getSyncState(selectedUuid.value);
    if (res.success) {
      syncState.value = res.data;
    }
  } catch {
    syncState.value = null;
  }
}

async function execSave() {
  if (!selectedUuid.value) {
    return;
  }
  if (!activeEditor.value) {
    ElMessage.info("当前页无可保存的配置（运维类页面请使用页面内按钮）");
    return;
  }
  if (!activeEditor.value.isDirty()) {
    ElMessage.info("没有未保存的修改");
    return;
  }
  const ok = await activeEditor.value.save();
  if (!ok) {
    ElMessage.error("保存失败");
  }
}

async function execAction(action: string) {
  if (!selectedUuid.value) {
    return;
  }
  if (action === "save") {
    await execSave();
    return;
  }
  if (action === "write_cfg" && hasDirtyChanges.value) {
    try {
      await ElMessageBox.confirm("有未保存的修改，写入的是磁盘上已保存的配置。是否继续？", "提示", {
        type: "warning",
        confirmButtonText: "继续写入",
        cancelButtonText: "取消",
      });
    } catch {
      return;
    }
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({ serverUuid: selectedUuid.value, commands: [{ action: action as never }] });
    const d = res.data as { success?: boolean; message?: string } | undefined;
    if (action === "write_cfg") {
      await refreshSyncState();
    }
    ElMessage[d?.success ? "success" : "warning"](d?.message ?? (action === "start" ? "已启动" : action === "stop" ? "已停止" : "已重启"));
    await refreshStatus();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

async function saveGlobalUiSettings(): Promise<void> {
  const client = store.getClient();
  if (!client) {
    return;
  }
  await uiSettings.saveToApi(client);
  ElMessage.success("全局设置已保存");
}

async function openServerDir(): Promise<void> {
  const dir = selectedServer.value?.serverDir;
  if (!dir) {
    ElMessage.warning("未设置服务器目录");
    return;
  }
  if (isElectron()) {
    await openPath(dir);
    return;
  }
  ElMessage.info(`服务器目录: ${dir}`);
}
</script>

<template>
  <div class="main-layout">
    <aside class="server-panel">
      <div class="panel-header">
        <span class="panel-title">服务器</span>
        <el-button size="small" text @click="$router.push('/connections')">连接</el-button>
      </div>
      <div class="panel-actions">
        <el-button size="small" @click="createServer">新建</el-button>
        <el-button size="small" :disabled="!selectedUuid" @click="renameServer">重命名</el-button>
        <el-button size="small" :disabled="!selectedUuid" @click="cloneServer">复制</el-button>
        <el-button size="small" type="danger" :disabled="!selectedUuid" @click="deleteServer">删除</el-button>
      </div>
      <el-input v-model="searchText" placeholder="筛选..." size="small" clearable class="panel-search" />
      <div class="server-list" v-loading="loading">
        <div
          v-for="s in servers.filter(s => !searchText || s.configName.toLowerCase().includes(searchText.toLowerCase()))"
          :key="s.uuid"
          :class="['server-item', { active: s.uuid === selectedUuid }]"
          @click="selectServer(s.uuid)"
        >
          <div class="server-name">{{ s.configName }}</div>
        </div>
        <el-empty v-if="!loading && servers.length === 0" description="无服务器配置" :image-size="32" />
      </div>
    </aside>

    <nav class="nav-panel">
      <template v-for="group in groups" :key="group.label || 'main'">
        <div v-if="group.label" class="nav-group-label">{{ group.label }}</div>
        <button
          v-for="tab in group.tabs"
          :key="tab.name"
          type="button"
          class="nav-item"
          :class="{ active: activeTab === tab.name, dirty: tab.name === activeTab && hasDirtyChanges }"
          :disabled="!selectedUuid"
          @click="navigateToTab(tab.name)"
        >
          {{ tab.label }}<span v-if="tab.name === activeTab && hasDirtyChanges" class="dirty-mark">*</span>
        </button>
      </template>
    </nav>

    <div class="main-area">
      <div class="action-bar">
        <div class="action-left">
          <el-button size="small" type="success" :disabled="isRunning || !selectedUuid" @click="execAction('start')">启动</el-button>
          <el-button size="small" type="warning" :disabled="!isRunning" @click="execAction('restart')">重启</el-button>
          <el-button size="small" type="danger" :disabled="!isRunning" @click="execAction('stop')">停止</el-button>
          <span class="sep" />
          <el-button size="small" :type="hasDirtyChanges ? 'primary' : 'default'" :disabled="!selectedUuid" @click="execSave">
            保存<span v-if="hasDirtyChanges">*</span>
          </el-button>
          <el-button size="small" :disabled="!selectedUuid" @click="execAction('write_cfg')">写入服务器</el-button>
          <el-button size="small" :disabled="!selectedUuid" @click="execAction('preflight')">体检</el-button>
          <span class="sep" />
          <el-popover trigger="click" width="300" popper-class="global-popover">
            <template #reference>
              <el-button size="small">全局设置</el-button>
            </template>
            <div class="global-settings">
              <div class="row">
                <span>读盘模式</span>
                <el-switch v-model="uiSettings.allowExternalConfigRefresh" size="small" />
              </div>
              <div class="row">
                <span>自动快照</span>
                <el-select v-model="uiSettings.autoSnapshotMode" size="small" style="width: 130px;">
                  <el-option label="关闭" value="Off" />
                  <el-option label="保存前" value="BeforeSave" />
                  <el-option label="写入前" value="BeforeWrite" />
                </el-select>
              </div>
              <div class="row">
                <span>异步快照</span>
                <el-switch v-model="uiSettings.autoSnapshotAsync" size="small" />
              </div>
              <el-button size="small" type="primary" @click="saveGlobalUiSettings">保存</el-button>
            </div>
          </el-popover>
        </div>
        <div class="action-right">
          <span class="status-badge" :class="isRunning ? 'running' : 'stopped'">{{ statusText }}</span>
        </div>
      </div>

      <div class="content-area">
        <div v-if="!selectedUuid" class="content-empty">
          <span>请从左侧选择或新建服务器配置</span>
        </div>
        <template v-else>
          <DashboardView v-if="activeTab === 'dashboard'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <BasicSettings v-else-if="activeTab === 'basic'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <PerformanceView v-else-if="activeTab === 'performance'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <NetworkView v-else-if="activeTab === 'network'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <DifficultyView v-else-if="activeTab === 'difficulty'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <SecurityView v-else-if="activeTab === 'security'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <LogSettingsView v-else-if="activeTab === 'log'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <ModsView v-else-if="activeTab === 'mods'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <RconView v-else-if="activeTab === 'rcon'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <BansView v-else-if="activeTab === 'bans'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <MissionsView v-else-if="activeTab === 'missions'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <SteamCmdView v-else-if="activeTab === 'steamcmd'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <StatisticsView v-else-if="activeTab === 'statistics'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <SchedulerView v-else-if="activeTab === 'scheduler'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <SnapshotsView v-else-if="activeTab === 'snapshots'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <LogsView v-else-if="activeTab === 'logs'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <PreflightView v-else-if="activeTab === 'preflight'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <SetupWizardView v-else-if="activeTab === 'wizard'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
          <AboutView v-else-if="activeTab === 'about'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
        </template>
      </div>

      <div class="status-bar">
        <span class="status-bar-left">
          <span class="status-bar-label">目录</span>
          <a href="#" class="dir-link" @click.prevent="openServerDir">{{ statusBarDir }}</a>
          <span class="status-bar-sep">|</span>
          <span class="status-bar-label">配置</span>
          <span>{{ syncStatusText }}</span>
        </span>
        <span class="status-bar-right">Arma3 Server Tools v2.0</span>
      </div>
    </div>

    <UnsavedChangesDialog ref="unsavedDialog" />
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
import SchedulerView from "./SchedulerView.vue";
import SnapshotsView from "./SnapshotsView.vue";
import LogsView from "./LogsView.vue";
import PreflightView from "./PreflightView.vue";
import SetupWizardView from "./SetupWizardView.vue";
import AboutView from "./AboutView.vue";
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100%;
  background: var(--a3st-bg);
}

.server-panel {
  width: 188px;
  min-width: 160px;
  border-right: 1px solid var(--a3st-border-subtle);
  display: flex;
  flex-direction: column;
  background: var(--a3st-bg-panel);
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--a3st-border-subtle);
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--a3st-border-subtle);
}

.panel-title {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--a3st-text-muted);
}

.panel-search {
  padding: 4px 6px;
}

.server-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 4px;
}

.server-item {
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 0;
  margin-bottom: 1px;
  font-size: 12px;
  color: var(--a3st-text);
}

.server-item:hover {
  background: var(--a3st-bg-hover);
}

.server-item.active {
  background: var(--a3st-bg-selected);
  color: var(--a3st-text-on-selected);
}

.server-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-panel {
  width: 132px;
  min-width: 120px;
  border-right: 1px solid var(--a3st-border-subtle);
  background: var(--a3st-bg-panel);
  flex-shrink: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.nav-group-label {
  padding: 8px 10px 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--a3st-text-dim);
}

.nav-item {
  display: block;
  width: 100%;
  padding: 4px 10px 4px 12px;
  border: none;
  background: transparent;
  color: var(--a3st-text-muted);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.nav-item:hover:not(:disabled) {
  background: var(--a3st-bg-hover);
  color: var(--a3st-text);
}

.nav-item.active {
  background: var(--a3st-bg-active);
  color: var(--a3st-text);
  border-left-color: var(--a3st-accent);
}

.nav-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.dirty-mark {
  color: var(--a3st-warning);
  margin-left: 2px;
}

.main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  background: var(--a3st-toolbar);
  border-bottom: 1px solid var(--a3st-border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 2px;
  min-height: 30px;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}

.sep {
  width: 1px;
  height: 16px;
  background: var(--a3st-border);
  margin: 0 4px;
}

.action-right {
  display: flex;
  align-items: center;
}

.status-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 0;
  font-family: var(--a3st-font-mono);
}

.status-badge.running {
  color: var(--a3st-success);
}

.status-badge.stopped {
  color: var(--a3st-text-dim);
}

.content-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--a3st-bg);
}

.content-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--a3st-text-dim);
  font-size: 12px;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  height: 22px;
  background: var(--a3st-statusbar);
  color: var(--a3st-statusbar-text);
  font-size: 11px;
  flex-shrink: 0;
}

.status-bar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status-bar-label {
  opacity: 0.85;
}

.status-bar-sep {
  opacity: 0.5;
  margin: 0 2px;
}

.status-bar-right {
  flex-shrink: 0;
  opacity: 0.9;
}

.dir-link {
  color: var(--a3st-statusbar-text);
  text-decoration: none;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-link:hover {
  text-decoration: underline;
}

.global-settings .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}
</style>
