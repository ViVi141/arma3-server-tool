<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerHealthData, ServerHealthState } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const health = ref<ServerHealthData | null>(null);
const error = ref("");
const now = ref(Date.now());
const labels: Record<ServerHealthState, string> = {
  stopped: "已停止", starting: "启动中", healthy: "健康", unhealthy: "异常", unverified: "未验证", maintenance: "维护中",
};
let generation = 0;
let disposed = false;
let pendingGeneration: number | null = null;
const stale = computed(() => !health.value || !Number.isFinite(Date.parse(health.value.checkedAt)) || now.value - Date.parse(health.value.checkedAt) > 30000);
const state = computed(() => stale.value ? "未验证" : labels[health.value!.state]);

async function refresh() {
  if (pendingGeneration === generation || disposed) return;
  const current = generation;
  pendingGeneration = current;
  now.value = Date.now();
  try {
    const client = store.getClient();
    if (!client) throw new Error("未连接 Service");
    const response = await client.serverHealth(props.serverUuid);
    if (disposed || current !== generation) return;
    if (!response.success || !response.data?.thresholds || !(response.data.state in labels)) throw new Error("尚未获取健康证据，请确认 Service 已升级并可访问");
    health.value = response.data;
    error.value = "";
  } catch (e) {
    if (current === generation && !disposed) {
      health.value = null;
      error.value = e instanceof Error ? e.message : "健康查询失败";
    }
  } finally { if (pendingGeneration === current) pendingGeneration = null; }
}
watch(() => `${props.connectionId}:${props.serverUuid}`, () => {
  generation++;
  health.value = null;
  error.value = "";
  void refresh();
}, { immediate: true });
const timer = setInterval(() => { now.value = Date.now(); void refresh(); }, 10000);
onUnmounted(() => { disposed = true; clearInterval(timer); });
function signal(value: boolean | null | undefined) { return value === true ? "已确认" : value === false ? "未通过" : "未知"; }
</script>

<template>
  <section class="health-panel" aria-label="独立任务健康" data-testid="server-health-panel">
    <header><h2>独立任务健康 · <span data-testid="server-health-state">{{ state }}</span></h2><el-button size="small" @click="refresh">刷新健康</el-button></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="stale">健康证据尚未获取或已超过 30 秒未采样，不能沿用旧的健康结论。</p>
    <template v-if="health && !stale">
      <dl class="health-evidence">
        <div><dt>进程存活 / PID</dt><dd>{{ signal(health.processAlive) }} / {{ health.pid ?? '未知' }}</dd></div>
        <div><dt>RCon 响应 / 在线人数</dt><dd>{{ signal(health.rconResponsive) }} / {{ health.onlineCount ?? '未知' }}</dd></div>
        <div><dt>实际任务 / 地图</dt><dd>{{ health.heartbeat?.mission ?? '未确认' }} / {{ health.heartbeat?.world ?? '未确认' }}</dd></div>
        <div><dt>心跳序号 / 连续有效条数</dt><dd>{{ health.heartbeat?.sequence ?? '未知' }} / {{ health.consecutiveHeartbeats }}</dd></div>
        <div><dt>运行时间 / FPS</dt><dd>{{ health.heartbeat?.uptimeSeconds ?? '未知' }} 秒 / {{ health.fps ?? '未知' }}</dd></div>
        <div><dt>最后心跳</dt><dd>{{ health.heartbeat?.emittedAt ?? '未收到' }}</dd></div>
        <div><dt>最后检查</dt><dd>{{ health.checkedAt }}</dd></div>
        <div><dt>独立 RPT</dt><dd>{{ health.rptPath ?? '未发现' }}</dd></div>
      </dl>
      <ul><li v-for="reason in [...health.configurationIssues, ...health.reasons]" :key="reason">{{ reason }}</li></ul>
      <p>心跳 {{ health.thresholds.heartbeatSeconds }} 秒；采样 {{ health.thresholds.sampleSeconds }} 秒；{{ health.thresholds.staleSeconds }} 秒无心跳异常；启动等待 {{ health.thresholds.startupTimeoutSeconds / 60 }} 分钟。需连续两条递增心跳、进程存活且 RCon 响应。</p>
    </template>
    <p>仅证明本机服务响应和任务运行；公网可达性、真实玩家加入尚未验证。健康异常仅告警，不会自动循环重启。</p>
    <router-link :to="`/console/${connectionId}/missions`">配置无人自动运行与健康心跳</router-link>
  </section>
</template>

<style scoped>
.health-panel { margin: 12px 0; padding: 14px; border: 1px solid var(--el-border-color); border-radius: 10px; font-size: 12px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { margin: 0; font-size: 16px; }
.health-evidence { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
dt { color: var(--el-text-color-secondary); }
dd { margin: 4px 0 0; overflow-wrap: anywhere; }
p { line-height: 1.6; color: var(--el-text-color-secondary); }
li { line-height: 1.8; }
</style>
