<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import DashboardHero from "@/components/dashboard/DashboardHero.vue";
import ServerHealthPanel from "@/components/dashboard/ServerHealthPanel.vue";
import DashboardDeployTrack from "@/components/dashboard/DashboardDeployTrack.vue";
import M3Icon from "@/components/M3Icon.vue";
import { UI_COPY } from "@/constants/uiCopy";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerStatus, DashboardData } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();

// 仪表盘的「刷新状态」同时要把运行态同步给外壳操作栏（启动/停止按钮的可用性），
// 否则刷新后按钮仍停留在旧状态。
const emit = defineEmits<{ "refresh-shell-status": [] }>();
const router = useRouter();
const store = useConnectionsStore();

const status = ref<ServerStatus | null>(null);
const dashboard = ref<DashboardData | null>(null);
const loading = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const modules = [
  {
    code: "SRV-01",
    icon: "fact_check",
    title: "开服检查",
    body: "启动前体检路径、端口、模组与 cfg 是否就绪。",
    tab: "preflight",
  },
  {
    code: "SRV-02",
    icon: "extension",
    title: "模组同步",
    body: "扫描本地 Workshop 目录，对照远程更新时间。",
    tab: "mods",
  },
  {
    code: "SRV-03",
    icon: "description",
    title: "RPT 日志",
    body: "查看最新 RPT 输出，排查启动与运行时错误。",
    tab: "logs",
  },
  {
    code: "SRV-04",
    icon: "tune",
    title: "基本设置",
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
    emit("refresh-shell-status");
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
      <ServerHealthPanel :connection-id="connectionId" :server-uuid="serverUuid" />
      <DashboardDeployTrack
        :connection-id="connectionId"
        :server-uuid="serverUuid"
        :status="status"
        :dashboard="dashboard"
      />

      <section class="dash-modules" aria-labelledby="dash-modules-title">
        <header class="dash-modules__head">
          <h2 id="dash-modules-title">快捷入口</h2>
        </header>
        <div class="dash-modules__grid">
          <button
            v-for="mod in modules"
            :key="mod.code"
            type="button"
            class="dash-card"
            :data-testid="`dash-card-${mod.tab}`"
            :aria-label="mod.title"
            @click="goTab(mod.tab)"
          >
            <span class="dash-card__icon" aria-hidden="true">
              <M3Icon :name="mod.icon" :size="22" />
            </span>
            <span class="dash-card__title">{{ mod.title }}</span>
            <span class="dash-card__body">{{ mod.body }}</span>
          </button>
        </div>
      </section>

      <section class="dash-stats" aria-label="状态摘要">
        <header class="dash-modules__head dash-modules__head--compact">
          <h2>运行读数</h2>
        </header>
        <div class="stat-grid">
          <div class="stat-tile stat-tile--signal">
            <span class="stat-tile__label">运行状态</span>
            <span class="stat-tile__value">{{ runningText() }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">进程号</span>
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
            <span class="stat-tile__label">在线统计</span>
            <span class="stat-tile__value">{{ monitoringText() }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">定时任务</span>
            <span class="stat-tile__value">{{ dashboard?.scheduleSummary ?? "-" }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">当前任务</span>
            <span class="stat-tile__value stat-tile__value--truncate">
              {{ status?.activeMissionTemplate ?? "-" }}
            </span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">模组数</span>
            <span class="stat-tile__value">{{ status?.serverModCount ?? "-" }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__label">最新日志</span>
            <span class="stat-tile__value stat-tile__value--truncate">{{ dashboard?.latestRpt ?? "-" }}</span>
          </div>
        </div>
      </section>

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
