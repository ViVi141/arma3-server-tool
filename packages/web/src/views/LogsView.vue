<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, onUnmounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { openPath, isElectron } from "@/utils/electron";
import type { LogFileEntry } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const isMobile = import.meta.env.VITE_APP_MODE === "mobile";
let logsToolbarClass = "logs-toolbar-desktop";
let logFileSelectStyle: { width: string } | undefined = { width: "280px" };
if (isMobile) {
  logsToolbarClass = "logs-toolbar-mobile";
  logFileSelectStyle = undefined;
}

const logKind = ref<"rpt" | "battleye" | "console" | "all">("console");
const files = ref<LogFileEntry[]>([]);
const selectedFile = ref("");
const lines = ref<string[]>([]);
const loading = ref(false);
const autoRefresh = ref(false);
const errorMsg = ref("");
const logDir = ref("");
const searchedDirs = ref<{ path: string; exists: boolean; note: string }[]>([]);
const noLogs = ref(false);
const diagOpen = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function formatLogLabel(file: LogFileEntry): string {
  if (file.kind === "console") {
    return `[Console] ${file.fileName}`;
  }
  if (file.kind === "rpt") {
    return `[RPT] ${file.fileName}`;
  }
  if (file.kind === "battleye") {
    return `[BE] ${file.fileName}`;
  }
  return file.fileName;
}

/**
 * 服务器还没配置目录时，后端 /logs 与 /logs/read 会返回 400（NO_SERVER_DIR）。
 * 浏览器对 4xx 会无条件打一条 console.error，与其"发出再吞掉"，不如先看配置再决定是否请求。
 */
async function hasServerDir(): Promise<boolean> {
  const client = store.getClient();
  if (!client) {
    return false;
  }
  try {
    const res = await client.getConfig(props.serverUuid);
    const server = (res.data as { server?: { serverDir?: string } } | undefined)?.server;
    return Boolean(server?.serverDir);
  } catch {
    return false;
  }
}

async function loadFileList() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.listLogFiles(props.serverUuid, logKind.value);
    if (res.success) {
      files.value = res.data.files ?? [];
      logDir.value = res.data.serverDir ?? "";
      searchedDirs.value = res.data.searchedDirs ?? [];
      noLogs.value = res.data.noLogs === true;
      if (files.value.length > 0 && !selectedFile.value) {
        selectedFile.value = files.value[0].filePath;
      }
    }
  } catch {
    /* ignore */
  }
}

async function loadLogs() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const client = store.getClient();
    if (!client) {
      throw new Error("无连接");
    }
    if (!(await hasServerDir())) {
      files.value = [];
      lines.value = ["[尚未设置服务器目录，无法读取日志]"];
      return;
    }
    await loadFileList();
    const res = await client.readLogs(props.serverUuid, logKind.value, {
      tail: 500,
      file: selectedFile.value || undefined,
    });
    if (res.success) {
      lines.value = res.data.lines ?? [];
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function openLogDirectory() {
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getServerPaths(props.serverUuid);
  const dir = res.success ? res.data.logDir : logDir.value;
  if (!dir) {
    ElMessage.warning("未设置日志目录");
    return;
  }
  if (isElectron()) {
    await openPath(dir);
    return;
  }
  ElMessage.info(`日志目录: ${dir}`);
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      loadLogs();
    }, 5000);
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

watch(autoRefresh, startAutoRefresh);
watch(logKind, () => {
  selectedFile.value = "";
  loadLogs();
});
watch(selectedFile, () => {
  if (selectedFile.value) {
    loadLogs();
  }
});

onMounted(() => {
  loadLogs();
});

onUnmounted(stopAutoRefresh);
</script>

<template>
  <ConsolePageLayout>
    <template #toolbar>
      <div :class="logsToolbarClass">
        <span class="logs-title">日志查看</span>
        <el-radio-group v-model="logKind">
          <el-radio-button value="console">Console</el-radio-button>
          <el-radio-button value="rpt">RPT</el-radio-button>
          <el-radio-button value="battleye">BattlEye</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-select
          v-if="files.length"
          v-model="selectedFile"
          size="small"
          placeholder="选择日志文件"
          :style="logFileSelectStyle"
        >
          <el-option
            v-for="file in files"
            :key="file.filePath"
            :label="formatLogLabel(file)"
            :value="file.filePath"
          />
        </el-select>
        <div class="logs-toolbar-row">
          <el-button type="primary" :loading="loading" @click="loadLogs">加载</el-button>
          <el-checkbox v-model="autoRefresh" size="small">自动刷新</el-checkbox>
          <el-button v-if="!isMobile" size="small" @click="openLogDirectory">打开日志目录</el-button>
        </div>
      </div>
    </template>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon style="margin-bottom: 12px;" />

    <section
      v-if="!loading && logKind !== 'console' && files.length === 0"
      class="log-diag"
      data-testid="log-diagnosis"
    >
      <h3 class="log-diag__title">没有找到 RPT 日志</h3>
      <ul class="log-diag__list">
        <li v-if="noLogs" class="log-diag__item is-warn">
          配置里开启了「禁用 RPT（-noLogs）」，服务器不会生成 .rpt 文件。
          到 配置 → 日志选项 关掉后重启服务器即可。
        </li>
        <li class="log-diag__item">
          服务器必须完整启动过一次才会写 RPT；如果进程起不来（路径 / DLL / 权限），
          请先看 Console 日志或开服检查结果。
        </li>
        <li class="log-diag__item">
          已按下列目录查找 <code>.rpt</code>：
          <ul class="log-diag__dirs">
            <li v-for="dir in searchedDirs" :key="dir.path">
              <span class="log-diag__flag" :class="{ 'is-ok': dir.exists }">{{ dir.exists ? "存在" : "不存在" }}</span>
              <code>{{ dir.path }}</code>
              <span class="log-diag__note">{{ dir.note }}</span>
            </li>
          </ul>
        </li>
      </ul>
      <div class="log-diag__actions">
        <el-button size="small" :loading="loading" @click="loadLogs">重新检测</el-button>
        <el-button v-if="!isMobile" size="small" @click="openLogDirectory">打开日志目录</el-button>
      </div>
    </section>

    <el-card v-if="lines.length">
      <pre class="log-pre">{{ lines.join('\n') }}</pre>
    </el-card>

    <el-empty v-else-if="!loading" description="点击加载查看日志" />
  </ConsolePageLayout>
</template>

<style scoped>
.log-diag {
  margin: 12px 16px;
  padding: 16px 18px;
  border-radius: var(--md-sys-shape-corner-md);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
}

.log-diag__title {
  margin: 0 0 10px;
  font-size: var(--md-sys-typescale-title-small-size);
  font-weight: 500;
}

.log-diag__list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: 1.55;
  color: var(--md-sys-color-on-surface-variant);
}

.log-diag__item.is-warn {
  color: var(--md-sys-color-error);
}

.log-diag__dirs {
  margin: 6px 0 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-diag__flag {
  display: inline-block;
  min-width: 3.2em;
  margin-right: 6px;
  color: var(--md-sys-color-error);
}

.log-diag__flag.is-ok {
  color: var(--md-sys-color-primary);
}

.log-diag__note {
  margin-left: 8px;
  opacity: 0.8;
}

.log-diag__actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.logs-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
}

.logs-toolbar-desktop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.logs-toolbar-desktop .logs-toolbar-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.log-pre {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  margin: 0;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
</style>
