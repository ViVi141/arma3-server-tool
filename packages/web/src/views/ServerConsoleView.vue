<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, provide } from "vue";
import { getVisualTheme } from "@/utils/visualTheme";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";
import { UI_COPY } from "@/constants/uiCopy";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useUiSettingsStore } from "@/stores/uiSettings";
import { useConfigSessionStore } from "@/stores/configSession";
import {
  consoleModes,
  modeForTab,
  defaultTabForMode,
  subTabsForMode,
  modeShowsProcActions,
  modeShowsCfgActions,
} from "@/config/console-modes";
import { resolveTabName } from "@/config/tab-registry";
import ConsoleShell from "@/components/console/ConsoleShell.vue";
import { openPath, isElectron } from "@/utils/electron";
import { resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";
import { CONFIG_EDITOR_KEY, type ConfigEditorRegistration } from "@/composables/configEditor";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog.vue";
import NewServerDialog from "@/components/NewServerDialog.vue";
import FirstServerWizard from "@/components/FirstServerWizard.vue";
import type { ServerSummary, ServerStatus, ServerSyncState } from "@a3st/api-client";

const route = useRoute();
const router = useRouter();
const store = useConnectionsStore();
const uiSettings = useUiSettingsStore();
const configSession = useConfigSessionStore();
const unsavedDialog = ref<InstanceType<typeof UnsavedChangesDialog> | null>(null);
const showNewServerDialog = ref(false);
const showFirstServerWizard = ref(false);
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
const serverRunningCache = ref<Record<string, boolean>>({});
let statusPollTimer: ReturnType<typeof setInterval> | null = null;

const activeTab = ref("dashboard");

const modes = computed(() => consoleModes(uiSettings.showAdvancedSettings));

const activeModeId = computed(() => modeForTab(activeTab.value));

const subTabs = computed(() => subTabsForMode(activeModeId.value, uiSettings.showAdvancedSettings));

const showProcActions = computed(() => modeShowsProcActions(activeModeId.value));

const showCfgActions = computed(() => modeShowsCfgActions(activeModeId.value));

const showProcInToolbar = computed(() => {
  if (!showProcActions.value) {
    return false;
  }
  if (getVisualTheme() === "ark") {
    return false;
  }
  return true;
});

const showDeployCfgInToolbar = computed(() => {
  if (getVisualTheme() === "ark" && activeModeId.value === "deploy") {
    return false;
  }
  return true;
});

const showSaveInToolbar = computed(() => {
  if (!showCfgActions.value) {
    return false;
  }
  return true;
});

const showWriteCfgInToolbar = computed(() => {
  if (!showCfgActions.value) {
    return false;
  }
  if (activeModeId.value === "workshop") {
    return false;
  }
  if (getVisualTheme() === "ark") {
    if (activeModeId.value === "overview" || activeModeId.value === "deploy") {
      return false;
    }
  }
  return true;
});

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
    return `${label} · ${UI_COPY.dirtySuffix}`;
  }
  if (syncState.value?.cfgStale) {
    return UI_COPY.syncStale;
  }
  if (syncState.value?.cfgWritten) {
    return UI_COPY.syncWritten;
  }
  return UI_COPY.syncPending;
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
  statusPollTimer = setInterval(() => {
    refreshStatus();
  }, 5000);
});

onUnmounted(() => {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
});

function serverDotClass(uuid: string): string {
  if (!(uuid in serverRunningCache.value)) {
    return "status-dot status-dot--unknown";
  }
  if (serverRunningCache.value[uuid]) {
    return "status-dot status-dot--running";
  }
  return "status-dot";
}

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

async function loadServers(forceReload = false) {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const reload = forceReload && uiSettings.allowExternalConfigRefresh;
    servers.value = await client.listServers(reload);
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

async function navigateToMode(modeId: string): Promise<void> {
  if (modeId === activeModeId.value) {
    return;
  }
  const ok = await confirmLeaveCurrent();
  if (!ok) {
    return;
  }
  activeTab.value = defaultTabForMode(modeId, uiSettings.showAdvancedSettings);
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

function createServer() {
  showNewServerDialog.value = true;
}

function openFirstServerWizard() {
  showFirstServerWizard.value = true;
}

async function onFirstServerWizardCompleted(uuid: string) {
  await loadServers();
  await selectServer(uuid);
}

async function onNewServerConfirm(payload: { configName: string; serverDir: string }) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const serverDir = payload.serverDir.trim();
    const res = await client.createServer(
      payload.configName,
      serverDir.length > 0 ? serverDir : undefined
    );
    if (!res.success) {
      throw new Error(res.error ?? "创建失败");
    }
    await loadServers();
    await selectServer(res.data.uuid);
    ElMessage.success("服务器已创建");
  } catch (e: unknown) {
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
    serverRunningCache.value[selectedUuid.value] = status.value.isRunning;
    if (status.value.isRunning) {
      statusText.value = `运行中 · PID ${status.value.pid}`;
    } else {
      statusText.value = "已停止";
    }
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

const TASK_ACTION_FALLBACK: Record<string, string> = {
  start: "已启动",
  stop: "已停止",
  restart: "已重启",
  write_cfg: "游戏配置已写入",
  preflight: UI_COPY.preflight + "完成",
};

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
    if (action === "write_cfg") {
      await refreshSyncState();
    }
    const fallback = TASK_ACTION_FALLBACK[action] ?? "操作完成";
    const msg = resolveTaskMessage(res.data as never, fallback);
    const ok = taskSucceeded(res.data as never);
    if (ok) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
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

async function openPathTarget(label: string, target?: string): Promise<void> {
  if (!target) {
    ElMessage.warning(`未设置${label}`);
    return;
  }
  if (isElectron()) {
    await openPath(target);
    return;
  }
  ElMessage.info(`${label}: ${target}`);
}

async function openServerDir(): Promise<void> {
  await openPathTarget("服务器目录", selectedServer.value?.serverDir);
}

async function openToolConfigDir(): Promise<void> {
  if (!selectedUuid.value) {
    return;
  }
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getServerPaths(selectedUuid.value);
  if (res.success) {
    await openPathTarget("工具配置目录", res.data.toolConfigDir);
  }
}

async function openServerConfigDir(): Promise<void> {
  if (!selectedUuid.value) {
    return;
  }
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getServerPaths(selectedUuid.value);
  if (res.success) {
    await openPathTarget("服务器配置目录", res.data.serverConfigDir);
  }
}

async function openLogDir(): Promise<void> {
  if (!selectedUuid.value) {
    return;
  }
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getServerPaths(selectedUuid.value);
  if (res.success) {
    await openPathTarget("日志目录", res.data.logDir);
  }
}

async function reloadFromDisk(): Promise<void> {
  if (!uiSettings.allowExternalConfigRefresh) {
    ElMessage.info("请先在全局设置中启用「读盘模式」");
    return;
  }
  await loadServers(true);
  if (activeEditor.value) {
    await activeEditor.value.discard();
  }
  await refreshSyncState();
  ElMessage.success("已从磁盘重新加载");
}

const instanceLabel = computed(() => selectedServer.value?.configName ?? "INSTANCE");

const cfgWritten = computed(() => syncState.value?.cfgWritten === true);

provide(CONSOLE_ACTIONS_KEY, {
  execAction,
  execSave,
  isRunning,
  hasDirtyChanges,
  instanceLabel,
  cfgWritten,
  openWizard: openFirstServerWizard,
});
</script>

<template>
  <ConsoleShell
    :modes="modes"
    :active-mode-id="activeModeId"
    :active-tab="activeTab"
    :sub-tabs="subTabs"
    :has-dirty-changes="hasDirtyChanges"
    :selected-uuid="selectedUuid"
    :servers="servers"
    :loading="loading"
    :search-text="searchText"
    :is-running="isRunning"
    :status-text="statusText"
    :status-bar-dir="statusBarDir"
    :sync-status-text="syncStatusText"
    :server-dot-class="serverDotClass"
    @update:search-text="searchText = $event"
    @navigate-mode="navigateToMode"
    @navigate-tab="navigateToTab"
    @select-server="selectServer"
    @create-server="createServer"
    @open-wizard="openFirstServerWizard"
    @rename="renameServer"
    @clone="cloneServer"
    @delete="deleteServer"
    @open-dir="openServerDir"
  >
    <template #actions>
      <template v-if="selectedUuid">
        <span v-if="showProcInToolbar" class="shell-v2__action-group">
          <span class="shell-v2__action-label">PROC</span>
          <el-button size="small" type="success" data-testid="btn-start" :disabled="isRunning" @click="execAction('start')">启动</el-button>
          <el-button size="small" type="warning" data-testid="btn-restart" :disabled="!isRunning" @click="execAction('restart')">重启</el-button>
          <el-button size="small" type="danger" data-testid="btn-stop" :disabled="!isRunning" @click="execAction('stop')">停止</el-button>
        </span>
        <span v-if="showProcInToolbar && showSaveInToolbar" class="shell-v2__action-sep" />
        <span v-if="showSaveInToolbar || showWriteCfgInToolbar" class="shell-v2__action-group">
          <span class="shell-v2__action-label">CFG</span>
          <el-button
            v-if="showSaveInToolbar"
            size="small"
            data-testid="btn-save"
            :type="hasDirtyChanges ? 'primary' : 'default'"
            @click="execSave"
          >
            {{ UI_COPY.saveShort }}<span v-if="hasDirtyChanges">*</span>
          </el-button>
          <el-button
            v-if="showWriteCfgInToolbar"
            size="small"
            data-testid="btn-write-cfg"
            @click="execAction('write_cfg')"
          >
            {{ UI_COPY.writeGameCfg }}
          </el-button>
          <el-button
            v-if="activeModeId === 'deploy' && showDeployCfgInToolbar"
            size="small"
            data-testid="btn-preflight"
            @click="execAction('preflight')"
          >
            {{ UI_COPY.preflight }}
          </el-button>
        </span>
        <span class="shell-v2__action-sep" />
        <span class="shell-v2__action-group">
          <span class="shell-v2__action-label">SYS</span>
          <el-popover trigger="click" width="300" popper-class="global-popover">
            <template #reference>
              <el-button size="small">全局设置</el-button>
            </template>
            <div class="global-settings">
              <div class="row">
                <span>显示高级设置</span>
                <el-switch v-model="uiSettings.showAdvancedSettings" size="small" />
              </div>
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
          <el-button size="small" @click="reloadFromDisk">读盘刷新</el-button>
          <el-dropdown trigger="click">
            <el-button size="small">打开目录</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openServerDir">服务器目录</el-dropdown-item>
                <el-dropdown-item @click="openToolConfigDir">工具配置目录</el-dropdown-item>
                <el-dropdown-item @click="openServerConfigDir">服务器配置目录</el-dropdown-item>
                <el-dropdown-item @click="openLogDir">日志目录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </span>
      </template>
    </template>

    <div v-if="!selectedUuid" class="shell-v2__content-empty" data-testid="content-empty-state">
      <p>{{ UI_COPY.firstServerEmptyHint }}</p>
      <div class="shell-v2__content-empty-actions">
        <el-button type="primary" size="small" data-testid="btn-first-server-wizard-main" @click="openFirstServerWizard">
          {{ UI_COPY.firstServerWizard }}
        </el-button>
        <el-button size="small" data-testid="btn-new-server-empty" @click="createServer">新建配置</el-button>
      </div>
    </div>
    <template v-else>
      <div class="shell-v2__page">
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
      <ConfigEditor v-else-if="activeTab === 'config'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
      <AboutView v-else-if="activeTab === 'about'" :connection-id="connectionId()" :server-uuid="selectedUuid" />
      </div>
    </template>
  </ConsoleShell>

  <UnsavedChangesDialog ref="unsavedDialog" />
  <NewServerDialog v-model="showNewServerDialog" @confirm="onNewServerConfirm" />
  <FirstServerWizard v-model="showFirstServerWizard" @completed="onFirstServerWizardCompleted" />
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
import ConfigEditor from "./ConfigEditor.vue";
import AboutView from "./AboutView.vue";
</script>

<style scoped>
.global-settings .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}
</style>
