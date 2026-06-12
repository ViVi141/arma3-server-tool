<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerStatus, DashboardData } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const router = useRouter();
const store = useConnectionsStore();

const status = ref<ServerStatus | null>(null);
const dashboard = ref<DashboardData | null>(null);
const loading = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadStatus();
  pollTimer = setInterval(loadStatus, 5000);
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});

async function loadStatus() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    status.value = await client.serverStatus(props.serverUuid);
    const dashRes = await client.getDashboard(props.serverUuid);
    if (dashRes.success) {
      dashboard.value = dashRes.data;
    }
  } catch {
    /* ignore */
  } finally {
    loading.value = false;
  }
}

function onlineText(): string {
  if (!status.value?.isRunning) {
    return "-";
  }
  if (dashboard.value?.onlineCount === null || dashboard.value?.onlineCount === undefined) {
    return "未知";
  }
  return String(dashboard.value.onlineCount);
}

function monitoringText(): string {
  const m = dashboard.value?.monitoring;
  if (!m || m.totalEntries === 0) {
    return "-";
  }
  return `均 ${m.avgPlayers.toFixed(1)} / 峰 ${m.peakPlayers}`;
}

function runningText(): string {
  if (status.value?.isRunning) {
    return "运行中";
  }
  return "已停止";
}

function goTab(tab: string) {
  router.push(`/console/${props.connectionId}/${tab}`);
}
</script>
<template>
  <ConsolePageLayout>
    <template #hint>进程控制请使用工具栏「启动 / 重启 / 停止」。</template>

    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-tile__label">运行状态</span><span class="stat-tile__value">{{ runningText() }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">进程 PID</span><span class="stat-tile__value">{{ status?.pid ?? '-' }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">在线人数</span><span class="stat-tile__value">{{ onlineText() }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">主机名</span><span class="stat-tile__value">{{ dashboard?.hostname ?? '-' }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">游戏端口</span><span class="stat-tile__value">{{ dashboard?.port ?? '-' }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">监控 / 统计</span><span class="stat-tile__value">{{ monitoringText() }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">定时 / 重启</span><span class="stat-tile__value">{{ dashboard?.scheduleSummary ?? '-' }}</span></div>
      <div class="stat-tile"><span class="stat-tile__label">最新 RPT</span><span class="stat-tile__value stat-tile__value--truncate">{{ dashboard?.latestRpt ?? '-' }}</span></div>
    </div>

    <div v-if="dashboard && !dashboard.cfgWritten" class="notice-bar">
      尚未写入游戏配置 — 启动前请先保存各设置页，并点击「写入服务器」。
    </div>

    <div class="quick-actions">
      <el-button size="small" :loading="loading" @click="loadStatus">刷新</el-button>
      <el-button size="small" @click="goTab('preflight')">启动前检查</el-button>
      <el-button size="small" @click="goTab('snapshots')">配置快照</el-button>
      <el-button size="small" @click="goTab('logs')">RPT 日志</el-button>
      <el-button size="small" @click="goTab('about')">关于</el-button>
    </div>
  </ConsolePageLayout>
</template>
<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.stat-tile__value--truncate {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-actions {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
