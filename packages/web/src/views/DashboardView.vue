<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerStatus } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const status = ref<ServerStatus | null>(null);
const loading = ref(false);
const executing = ref(false);
const hostname = ref("-");
const port = ref("-");
const onlineCount = ref("-");
const monitoringSummary = ref("-");
const scheduleSummary = ref("-");
const rptFile = ref("-");
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => { loadStatus(); pollTimer = setInterval(loadStatus, 5000); });
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

async function loadStatus() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    status.value = await client.serverStatus(props.serverUuid);
  } catch { /* ignore */ }
  finally { loading.value = false; }
  // Load config fields
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data as Record<string, unknown>;
      const basic = (cfg.basic ?? {}) as Record<string, unknown>;
      hostname.value = (basic.hostname as string) ?? "-";
      port.value = String(basic.port ?? (basic.rconPort ?? "-"));
    }
  } catch { /* ignore */ }
}

async function execAction(action: "start" | "stop" | "restart") {
  executing.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action }] });
    const d = res.data as { success?: boolean; message?: string };
    ElMessage[d?.success ? "success" : "warning"](d?.message ?? (action === "start" ? "已启动" : action === "stop" ? "已停止" : "已重启"));
    await loadStatus();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
  finally { executing.value = false; }
}
</script>
<template>
  <div class="dashboard-page">
    <div class="action-bar">
      <el-button type="success" :disabled="status?.isRunning" :loading="executing" @click="execAction('start')" size="large">▶ 启动</el-button>
      <el-button type="warning" :disabled="!status?.isRunning" :loading="executing" @click="execAction('restart')" size="large">⟳ 重启</el-button>
      <el-button type="danger" :disabled="!status?.isRunning" :loading="executing" @click="execAction('stop')" size="large">■ 停止</el-button>
      <el-button :loading="loading" @click="loadStatus" size="large">刷新</el-button>
    </div>

    <el-row :gutter="8" style="margin-top: 8px;">
      <el-col :span="6"><div class="ov"><span class="ov-l">运行状态</span><span class="ov-v">{{ status?.isRunning ? '运行中' : '已停止' }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">进程 PID</span><span class="ov-v">{{ status?.pid ?? '-' }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">在线人数</span><span class="ov-v">{{ onlineCount }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">主机名</span><span class="ov-v">{{ hostname }}</span></div></el-col>
    </el-row>
    <el-row :gutter="8" style="margin-top: 4px;">
      <el-col :span="6"><div class="ov"><span class="ov-l">游戏端口</span><span class="ov-v">{{ port }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">监控 / 统计</span><span class="ov-v">{{ monitoringSummary }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">定时 / 重启</span><span class="ov-v">{{ scheduleSummary }}</span></div></el-col>
      <el-col :span="6"><div class="ov"><span class="ov-l">最新 RPT</span><span class="ov-v">{{ rptFile }}</span></div></el-col>
    </el-row>

    <div style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;">
      <el-button size="small" @click="$router.push(`/console/${connectionId}/preflight`)">启动前检查</el-button>
      <el-button size="small" @click="$router.push(`/console/${connectionId}/preflight`)">开服体检</el-button>
      <el-button size="small" @click="$router.push(`/console/${connectionId}/snapshots`)">配置快照...</el-button>
      <el-button size="small" @click="$router.push(`/console/${connectionId}/logs`)">查看 RPT 日志</el-button>
      <el-button size="small" @click="$router.push(`/console/${connectionId}/about`)">关于</el-button>
    </div>
  </div>
</template>
<style scoped>
.dashboard-page { padding: 8px; }
.action-bar { display: flex; gap: 6px; flex-wrap: wrap; }
.ov { display: flex; justify-content: space-between; padding: 6px 10px; background: var(--el-fill-color-light); border: 1px solid var(--el-border-color-light); font-size: 12px; }
.ov-l { color: var(--el-text-color-secondary); }
.ov-v { font-weight: 600; }
</style>
