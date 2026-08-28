<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import DashboardHero from "@/components/dashboard/DashboardHero.vue";
import { UI_COPY } from "@/constants/uiCopy";
import { ref, onMounted, onUnmounted, computed } from "vue";
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

const modules = [
  {
    code: "SRV-01",
    title: "CALIBRATE",
    subtitle: "开服检查",
    body: "启动前体检路径、端口、模组与 cfg 是否就绪。",
    tab: "preflight",
  },
  {
    code: "SRV-02",
    title: "WORKSHOP",
    subtitle: "模组同步",
    body: "扫描本地 Workshop 目录，对照远程更新时间。",
    tab: "mods",
    dark: true,
  },
  {
    code: "SRV-03",
    title: "LOGS",
    subtitle: "RPT 日志",
    body: "查看最新 RPT 输出，排查启动与运行时错误。",
    tab: "logs",
  },
  {
    code: "SRV-04",
    title: "CONFIG",
    subtitle: "基本设置",
    body: "主机名、端口、密码与 BattlEye 等核心参数。",
    tab: "basic",
  },
];

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

const isRunning = computed(() => status.value?.isRunning === true);

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
  <ConsolePageLayout :padded="false" data-testid="dashboard-page">
    <DashboardHero :status="status" :dashboard="dashboard" :loading="loading" />

    <div class="dash-body">
      <section class="dash-modules" aria-labelledby="dash-modules-title">
        <header class="dash-modules__head">
          <p class="dash-modules__kicker">QUICK ROUTES</p>
          <h2 id="dash-modules-title">MODULES</h2>
        </header>
        <div class="dash-modules__grid">
          <article
            v-for="mod in modules"
            :key="mod.code"
            class="dash-module"
            :class="{ 'dash-module--dark': mod.dark }"
          >
            <p class="dash-module__code">{{ mod.code }} / {{ mod.title }}</p>
            <h3>{{ mod.subtitle }}</h3>
            <p class="dash-module__body">{{ mod.body }}</p>
            <button type="button" class="dash-module__link" @click="goTab(mod.tab)">
              打开 →
            </button>
          </article>
        </div>
      </section>

      <section class="dash-stats" aria-label="状态摘要">
        <header class="dash-modules__head dash-modules__head--compact">
          <p class="dash-modules__kicker">READOUT</p>
          <h2>STATUS</h2>
        </header>
        <div class="stat-grid">
          <div class="stat-tile stat-tile--signal">
            <span class="stat-tile__label">运行状态</span>
            <span class="stat-tile__value">{{ runningText() }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">进程 PID</span>
            <span class="stat-tile__value">{{ status?.pid ?? "-" }}</span>
          </div>
          <div class="stat-tile stat-tile--signal">
            <span class="stat-tile__label">在线人数</span>
            <span class="stat-tile__value">{{ onlineText() }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">主机名</span>
            <span class="stat-tile__value">{{ dashboard?.hostname ?? "-" }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">游戏端口</span>
            <span class="stat-tile__value">{{ dashboard?.port ?? "-" }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">监控 / 统计</span>
            <span class="stat-tile__value">{{ monitoringText() }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">定时 / 重启</span>
            <span class="stat-tile__value">{{ dashboard?.scheduleSummary ?? "-" }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">最新 RPT</span>
            <span class="stat-tile__value stat-tile__value--truncate">{{ dashboard?.latestRpt ?? "-" }}</span>
          </div>
        </div>
      </section>

      <div v-if="dashboard && !dashboard.cfgWritten" class="notice-bar">
        尚未写入游戏配置 — 请先在各设置页保存，再点击「{{ UI_COPY.writeGameCfg }}」。
      </div>

      <div class="quick-actions dash-actions">
        <el-button size="small" :loading="loading" @click="loadStatus">刷新状态</el-button>
        <el-button size="small" data-testid="dashboard-preflight" @click="goTab('preflight')">
          {{ UI_COPY.preflight }}
        </el-button>
        <el-button size="small" @click="goTab('snapshots')">配置快照</el-button>
        <el-button size="small" @click="goTab('logs')">RPT 日志</el-button>
        <el-button size="small" @click="goTab('about')">关于</el-button>
      </div>
    </div>
  </ConsolePageLayout>
</template>
<style scoped>
.dash-body {
  padding: 12px 14px 16px;
}

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
