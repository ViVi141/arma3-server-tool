<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { computed, ref, onMounted, onUnmounted } from "vue";
import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { useThemeMode } from "@/config/theme";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigSessionStore } from "@/stores/configSession";
import { useConfigEditorRegistration } from "@/composables/configEditor";
import { applyDefaults } from "@/utils/defaults";
import type { MonitoringPlayerRow, MonitoringStatsPoint } from "@a3st/api-client";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const configSession = useConfigSessionStore();
const { themeMode } = useThemeMode();

const activeSubTab = ref("overview");
const chartData = ref<{ labels: string[]; online: number[]; fps: number[] }>({ labels: [], online: [], fps: [] });
const summary = ref({ avgPlayers: 0, peakPlayers: 0, totalEntries: 0 });
const players = ref<MonitoringPlayerRow[]>([]);
const monitoringEnabled = ref(false);
const loading = ref(false);
const savingMonitoring = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadMonitoringConfig();
  loadData();
  timer = setInterval(loadData, 30000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});

async function loadMonitoringConfig() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = applyDefaults(res.data as Record<string, unknown>);
      const monitoring = (cfg.monitoring ?? {}) as Record<string, unknown>;
      monitoringEnabled.value = !!monitoring.enabled;
    }
  } catch {
    /* ignore */
  }
}

async function saveMonitoringConfig() {
  savingMonitoring.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.patchConfig(props.serverUuid, {
      monitoring: { enabled: monitoringEnabled.value },
    } as never);
    if (!res.success) {
      throw new Error(res.error ?? "保存失败");
    }
    configSession.markClean(props.serverUuid);
    ElMessage.success("监控设置已保存");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    savingMonitoring.value = false;
  }
}

// 监控开关属于"点保存才生效"的配置项，接入未保存拦截
const { markDirty } = useConfigEditorRegistration(() => props.serverUuid, {
  label: "监控",
  save: saveMonitoringConfig,
  reload: loadMonitoringConfig,
});

async function collectNow() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.postRaw("/api/v1/monitoring/collect", { method: "POST" });
    ElMessage.success("采集任务已触发");
    await loadData();
  } catch {
    ElMessage.error("采集失败");
  }
}

async function loadData() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }

    const [summaryRes, statsRes, playersRes] = await Promise.all([
      client.getMonitoringSummary(props.serverUuid),
      client.getMonitoringStats(props.serverUuid, 24),
      client.getMonitoringPlayers(props.serverUuid),
    ]);

    if (summaryRes.success) {
      summary.value = summaryRes.data;
    }

    if (statsRes.success) {
      const stats = statsRes.data.stats ?? [];
      chartData.value = buildChart(stats);
    }

    if (playersRes.success) {
      players.value = playersRes.data.players ?? [];
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function buildChart(stats: MonitoringStatsPoint[]): { labels: string[]; online: number[]; fps: number[] } {
  const labels: string[] = [];
  const online: number[] = [];
  const fps: number[] = [];
  for (const point of stats.slice(-60)) {
    labels.push(point.timestamp.slice(11, 19));
    online.push(point.playerCount);
    fps.push(point.serverFps ?? 0);
  }
  return { labels, online, fps };
}

async function exportCsv() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.exportMonitoringCsv(props.serverUuid, "stats");
    if (!res.success) {
      throw new Error(res.error ?? "导出失败");
    }
    const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stats_${props.serverUuid}.csv`;
    a.click();
    ElMessage.success("CSV 已导出");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "导出失败");
  }
}

// —— 趋势图：chart.js + M3 语义色（颜色取自运行期 token，主题切换用 key 重建） ——
function tokenColor(name: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

function trendDatasets(
  label: string,
  series: number[],
  config: { line: string; area: string }
) {
  return [
    {
      label,
      data: series,
      borderColor: config.line,
      backgroundColor: config.area,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.35,
    },
  ];
}

const trendOptions = computed(() => {
  const grid = tokenColor("--md-sys-color-outline-variant", "rgba(120,120,120,0.24)");
  const tick = tokenColor("--md-sys-color-on-surface-variant", "#5f5b66");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 240 },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: tokenColor("--md-sys-color-surface-container-highest", "#e8e0ec") },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: grid, drawTicks: false }, ticks: { color: tick } },
    },
  };
});

const onlineChartData = computed(() => ({
  labels: chartData.value.labels,
  datasets: trendDatasets("在线人数", chartData.value.online, {
    line: tokenColor("--md-sys-color-primary", "#6750a4"),
    area: tokenColor("--md-sys-color-primary-container", "rgba(103,80,164,0.18)"),
  }),
}));

const fpsChartData = computed(() => ({
  labels: chartData.value.labels,
  datasets: trendDatasets("FPS", chartData.value.fps, {
    line: tokenColor("--md-sys-color-tertiary", "#7d5260"),
    area: tokenColor("--md-sys-color-tertiary-container", "rgba(125,82,96,0.18)"),
  }),
}));

async function exportHtml() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.exportMonitoringHtml(props.serverUuid);
    if (!res.success) {
      throw new Error(res.error ?? "导出失败");
    }
    const blob = new Blob([res.data.html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report_${props.serverUuid}.html`;
    a.click();
    ElMessage.success("HTML 日报已导出");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "导出失败");
  }
}
</script>

<template>
  <div class="stats-page">
    <el-tabs v-model="activeSubTab" class="sub-tabs">
      <el-tab-pane label="数据概览" name="overview">
        <ConsolePageLayout :padded="false">
          <template #toolbar>
            <el-button size="small" @click="loadData" :loading="loading">刷新统计</el-button>
            <el-button size="small" @click="exportCsv">导出 CSV...</el-button>
            <el-button size="small" @click="exportHtml">导出 HTML 日报...</el-button>
          </template>
          <div class="stats-body">
          <el-row :gutter="8" style="margin-bottom:8px;">
            <el-col :span="8"><div class="ov"><span class="ov-l">平均在线</span><span class="ov-v">{{ summary.avgPlayers.toFixed(1) }}</span></div></el-col>
            <el-col :span="8"><div class="ov"><span class="ov-l">峰值在线</span><span class="ov-v">{{ summary.peakPlayers }}</span></div></el-col>
            <el-col :span="8"><div class="ov"><span class="ov-l">采样点数</span><span class="ov-v">{{ summary.totalEntries }}</span></div></el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-card shadow="never">
                <template #header><span>在线人数趋势 (24h)</span></template>
                <div class="chart-wrap">
                  <Line :key="`online-${themeMode}`" :data="onlineChartData" :options="trendOptions" />
                </div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="never">
                <template #header><span>FPS 趋势 (24h)</span></template>
                <div class="chart-wrap">
                  <Line :key="`fps-${themeMode}`" :data="fpsChartData" :options="trendOptions" />
                </div>
              </el-card>
            </el-col>
          </el-row>
          <el-card shadow="never" style="margin-top:8px;">
            <template #header><span>玩家记录</span></template>
            <el-table v-if="players.length" :data="players" stripe size="small">
              <el-table-column prop="playerName" label="名称" min-width="150"/>
              <el-table-column prop="playerGuid" label="GUID" width="180"/>
              <el-table-column prop="lastSeen" label="最后在线" width="160">
                <template #default="{ row }">{{ (row.lastSeen ?? "").slice(0, 19).replace("T", " ") }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="无玩家记录"/>
          </el-card>
          </div>
        </ConsolePageLayout>
      </el-tab-pane>

      <el-tab-pane label="监控设置" name="settings">
        <ConsolePageLayout :padded="false">
          <SettingsViewLayout kicker="LOGS / 04 · MON" title="监控设置">
          <ArkTechPanel title="采集开关" code="MON-01">
            <div class="form-row">
              <el-checkbox v-model="monitoringEnabled" @change="markDirty()">启用监控</el-checkbox>
            </div>
            <div class="form-row">
              <el-button size="small" type="primary" :loading="savingMonitoring" @click="saveMonitoringConfig">保存</el-button>
              <el-button size="small" @click="collectNow">立即采集</el-button>
            </div>
            <p class="hint">启用后配合「定时」页的监控 Cron 与「同步到调度器」自动采集在线数据。</p>
          </ArkTechPanel>
          </SettingsViewLayout>
        </ConsolePageLayout>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.stats-page { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--a3st-bg); }
.sub-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.sub-tabs :deep(.el-tabs) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.sub-tabs :deep(.el-tabs__header) { flex-shrink: 0; margin: 0; padding: 0 8px; background: var(--a3st-toolbar); border-bottom: 1px solid var(--a3st-border-subtle); }
.sub-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: hidden; }
.sub-tabs :deep(.el-tab-pane) { height: 100%; overflow: hidden; }
.stats-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.chart-wrap { height: 220px; position: relative; }

/* 指标卡：用 M3 语义角色，不再叠一层描边 */
.ov {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-md);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
}
.ov-l { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-medium-size); }
.ov-v { font-family: var(--md-ref-typeface-brand); font-size: var(--md-sys-typescale-headline-small-size); font-weight: 400; line-height: 1.1; }
.form-row label { width: 100px; }
.hint { font-size: 11px; color: var(--a3st-text-dim); margin-top: 8px; }
</style>
