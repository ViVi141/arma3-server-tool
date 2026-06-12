<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, onUnmounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { openPath, isElectron } from "@/utils/electron";
import type { LogFileEntry } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const logKind = ref<"rpt" | "battleye" | "all">("rpt");
const files = ref<LogFileEntry[]>([]);
const selectedFile = ref("");
const lines = ref<string[]>([]);
const loading = ref(false);
const autoRefresh = ref(false);
const errorMsg = ref("");
const logDir = ref("");
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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
      <span class="logs-title">日志查看</span>
      <el-radio-group v-model="logKind">
        <el-radio-button value="rpt">RPT</el-radio-button>
        <el-radio-button value="battleye">BattlEye</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-select
        v-if="files.length"
        v-model="selectedFile"
        size="small"
        placeholder="选择日志文件"
        style="width: 280px;"
      >
        <el-option v-for="file in files" :key="file.filePath" :label="file.fileName" :value="file.filePath" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="loadLogs">加载</el-button>
      <el-checkbox v-model="autoRefresh" size="small">自动刷新</el-checkbox>
      <el-button size="small" @click="openLogDirectory">打开日志目录</el-button>
    </template>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon style="margin-bottom: 12px;" />

    <el-card v-if="lines.length">
      <pre class="log-pre">{{ lines.join('\n') }}</pre>
    </el-card>

    <el-empty v-else-if="!loading" description="点击加载查看日志" />
  </ConsolePageLayout>
</template>

<style scoped>
.logs-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
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
