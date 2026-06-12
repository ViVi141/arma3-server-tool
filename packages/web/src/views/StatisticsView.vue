<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigSessionStore } from "@/stores/configSession";
import { applyDefaults } from "@/utils/defaults";
import type { MonitoringPlayerRow, MonitoringStatsPoint } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const configSession = useConfigSessionStore();

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
    await client.patchConfig(props.serverUuid, {
      monitoring: { enabled: monitoringEnabled.value },
    } as never);
    configSession.markClean(props.serverUuid);
    ElMessage.success("监控设置已保存");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    savingMonitoring.value = false;
  }
}

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
            <el-col :span="12"><el-card shadow="never"><template #header><span>在线人数趋势 (24h)</span></template>
              <div style="height:200px;display:flex;align-items:flex-end;gap:2px;overflow-x:auto;">
                <div v-for="(v,i) in chartData.online" :key="i" :title="`${v}人`" :style="{height:Math.max(4,v*20)+'px',width:'8px',background:'#409eff',borderRadius:'1px',flexShrink:0}"/>
              </div></el-card></el-col>
            <el-col :span="12"><el-card shadow="never"><template #header><span>FPS 趋势 (24h)</span></template>
              <div style="height:200px;display:flex;align-items:flex-end;gap:2px;overflow-x:auto;">
                <div v-for="(v,i) in chartData.fps" :key="i" :title="`${v.toFixed(1)} FPS`" :style="{height:Math.max(4,v*2)+'px',width:'8px',background:'#67c23a',borderRadius:'1px',flexShrink:0}"/>
              </div></el-card></el-col>
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
        <ConsolePageLayout>
          <fieldset>
            <legend>采集开关</legend>
            <div class="row">
              <label>启用监控</label>
              <el-switch v-model="monitoringEnabled" />
            </div>
            <div class="row">
              <el-button size="small" type="primary" :loading="savingMonitoring" @click="saveMonitoringConfig">保存</el-button>
              <el-button size="small" @click="collectNow">立即采集</el-button>
            </div>
            <p class="hint">启用后配合「定时」页的监控 Cron 与「同步到调度器」自动采集在线数据。</p>
          </fieldset>
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
.stats-body { padding: 6px 8px; }
.ov { display: flex; justify-content: space-between; padding: 5px 8px; background: var(--a3st-bg-panel); border: 1px solid var(--a3st-border-subtle); font-size: 12px; }
.ov-l { color: var(--a3st-text-muted); }
.ov-v { font-weight: 600; font-family: var(--a3st-font-mono); }
fieldset { border: 1px solid var(--a3st-border); background: var(--a3st-bg-panel); padding: 8px 10px; }
legend { font-size: 11px; font-weight: 600; color: var(--a3st-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.row label { width: 100px; color: var(--a3st-text-muted); }
.hint { font-size: 11px; color: var(--a3st-text-dim); margin-top: 8px; }
</style>
