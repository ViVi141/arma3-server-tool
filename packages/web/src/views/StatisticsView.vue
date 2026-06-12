<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const chartData = ref<{ labels: string[]; online: number[]; fps: number[] }>({ labels: [], online: [], fps: [] });
const summary = ref({ avgPlayers: 0, peakPlayers: 0, avgFps: 0, totalEntries: 0 });
const players = ref<{ playerName: string; playerGuid: string; lastSeen: string }[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => { loadData(); timer = setInterval(loadData, 30000); });
onUnmounted(() => { if (timer) clearInterval(timer); });

async function loadData() {
  try {
    const client = store.getClient(); if (!client) return;
    const baseUrl = store.active?.baseUrl ?? "";
    const res = await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/monitoring/summary`);
    if (res.ok) summary.value = (await res.json()).data ?? {};
    chartData.value.labels.push(new Date().toLocaleTimeString());
    chartData.value.online.push(summary.value.avgPlayers ?? 0);
    chartData.value.fps.push(summary.value.avgFps ?? 0);
    if (chartData.value.labels.length > 60) { chartData.value.labels.shift(); chartData.value.online.shift(); chartData.value.fps.shift(); }
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

async function exportCsv() {
  try {
    const baseUrl = store.active?.baseUrl ?? "";
    const res = await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/monitoring/summary`);
    const data = await res.json();
    const csv = "时间,在线,FPS\n" + chartData.value.labels.map((l, i) => `${l},${chartData.value.online[i]},${chartData.value.fps[i]}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `stats_${props.serverUuid}.csv`; a.click();
    ElMessage.success("CSV 已导出");
  } catch { ElMessage.error("导出失败"); }
}
</script>
<template>
<div class="page">
<div class="toolbar">
  <el-button size="small" @click="loadData" :loading="loading">刷新统计</el-button>
  <el-button size="small" @click="exportCsv">导出 CSV...</el-button>
</div>
<div class="body">
<el-row :gutter="8" style="margin-bottom:8px;">
  <el-col :span="6"><div class="ov"><span class="ov-l">平均在线</span><span class="ov-v">{{summary.avgPlayers}}</span></div></el-col>
  <el-col :span="6"><div class="ov"><span class="ov-l">峰值在线</span><span class="ov-v">{{summary.peakPlayers}}</span></div></el-col>
  <el-col :span="6"><div class="ov"><span class="ov-l">平均 FPS</span><span class="ov-v">{{summary.avgFps?.toFixed(1)}}</span></div></el-col>
  <el-col :span="6"><div class="ov"><span class="ov-l">采样点数</span><span class="ov-v">{{summary.totalEntries}}</span></div></el-col>
</el-row>
<el-row :gutter="8">
  <el-col :span="12"><el-card shadow="never"><template #header><span>在线人数趋势</span></template>
    <div style="height:200px;display:flex;align-items:flex-end;gap:2px;overflow-x:auto;">
      <div v-for="(v,i) in chartData.online.slice(-60)" :key="i" :title="`${v}人`" :style="{height:Math.max(4,v*20)+'px',width:'8px',background:'#409eff',borderRadius:'1px',flexShrink:0}"/>
    </div></el-card></el-col>
  <el-col :span="12"><el-card shadow="never"><template #header><span>FPS 趋势</span></template>
    <div style="height:200px;display:flex;align-items:flex-end;gap:2px;overflow-x:auto;">
      <div v-for="(v,i) in chartData.fps.slice(-60)" :key="i" :title="`${v.toFixed(1)} FPS`" :style="{height:Math.max(4,v*2)+'px',width:'8px',background:'#67c23a',borderRadius:'1px',flexShrink:0}"/>
    </div></el-card></el-col>
</el-row>
<el-card shadow="never" style="margin-top:8px;">
  <template #header><span>玩家记录</span></template>
  <el-table v-if="players.length" :data="players" stripe size="small">
    <el-table-column prop="playerName" label="名称" min-width="150"/><el-table-column prop="playerGuid" label="GUID" width="180"/>
    <el-table-column prop="lastSeen" label="最后在线" width="160"><template #default="{row}">{{(row.lastSeen??'').slice(0,19).replace('T',' ')}}</template></el-table-column>
  </el-table>
  <el-empty v-else description="无玩家记录"/>
</el-card>
</div></div>
</template>
<style scoped>
.page{height:100%;display:flex;flex-direction:column}
.toolbar{padding:4px 8px;display:flex;gap:4px;border-bottom:1px solid var(--el-border-color);flex-shrink:0}
.body{flex:1;overflow:auto;padding:8px}
.ov{display:flex;justify-content:space-between;padding:6px 10px;background:var(--el-fill-color-light);border:1px solid var(--el-border-color-light);font-size:12px}
.ov-l{color:var(--el-text-color-secondary)}.ov-v{font-weight:600}
</style>
