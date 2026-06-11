<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const chartData = ref<{ labels: string[]; online: number[]; fps: number[] }>({ labels: [], online: [], fps: [] });
const summary = ref({ avgPlayers: 0, peakPlayers: 0, avgFps: 0, totalEntries: 0 });
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadData();
  timer = setInterval(loadData, 30000);
});

onUnmounted(() => { if (timer) clearInterval(timer); });

async function loadData() {
  try {
    const client = store.getClient();
    if (!client) return;
    const baseUrl = store.active?.baseUrl ?? "";

    const res = await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/monitoring/summary`);
    if (res.ok) summary.value = (await res.json()).data ?? {};

    // Get stats for chart
    const statsRes = await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/monitoring/summary`);
    const stats = (await statsRes.json()).data ?? {};
    chartData.value.labels.push(new Date().toLocaleTimeString());
    chartData.value.online.push(stats.avgPlayers ?? 0);
    chartData.value.fps.push(stats.avgFps ?? 0);
    if (chartData.value.labels.length > 60) {
      chartData.value.labels.shift();
      chartData.value.online.shift();
      chartData.value.fps.shift();
    }
  } catch { /* ignore */ }
  finally { loading.value = false; }
}
</script>

<template>
  <div class="stats-page">
    <h2>监控统计</h2>

    <el-row :gutter="12" style="margin: 12px 0;">
      <el-col :span="6"><el-statistic title="平均在线" :value="summary.avgPlayers" /></el-col>
      <el-col :span="6"><el-statistic title="峰值在线" :value="summary.peakPlayers" /></el-col>
      <el-col :span="6"><el-statistic title="平均 FPS" :value="summary.avgFps" :precision="1" /></el-col>
      <el-col :span="6"><el-statistic title="采样点数" :value="summary.totalEntries" /></el-col>
    </el-row>

    <el-row :gutter="12">
      <el-col :span="12">
        <el-card>
          <template #header><span>在线人数趋势</span></template>
          <div style="height: 260px; display: flex; align-items: flex-end; gap: 2px; padding: 8px; overflow-x: auto;">
            <div v-for="(v, i) in chartData.online.slice(-60)" :key="i"
              :title="`${chartData.labels[chartData.labels.length - chartData.online.slice(-60).length + i]}: ${v}人`"
              :style="{ height: Math.max(4, v * 20) + 'px', width: '8px', background: '#409eff', borderRadius: '2px', flexShrink: 0, minWidth: '8px' }" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>FPS 趋势</span></template>
          <div style="height: 260px; display: flex; align-items: flex-end; gap: 2px; padding: 8px; overflow-x: auto;">
            <div v-for="(v, i) in chartData.fps.slice(-60)" :key="i"
              :title="`${chartData.labels[chartData.labels.length - chartData.fps.slice(-60).length + i]}: ${v.toFixed(1)} FPS`"
              :style="{ height: Math.max(4, v * 2) + 'px', width: '8px', background: '#67c23a', borderRadius: '2px', flexShrink: 0, minWidth: '8px' }" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
