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
const errorMsg = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function loadStatus() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const client = store.getClient();
    if (!client) throw new Error("无连接");
    status.value = await client.serverStatus(props.serverUuid);
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function execAction(action: "start" | "stop" | "restart") {
  executing.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action }],
    });
    const taskResult = res.data as { success: boolean; message: string };
    if (taskResult?.success) {
      ElMessage.success({ message: taskResult.message, duration: 3000 });
    } else {
      ElMessage.warning({ message: taskResult?.message ?? "操作完成但状态未知", duration: 4000 });
    }
    await loadStatus();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    ElMessage.error(msg);
  } finally {
    executing.value = false;
  }
}

onMounted(() => {
  loadStatus();
  pollTimer = setInterval(loadStatus, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="dashboard">
    <h2>仪表盘</h2>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon style="margin: 12px 0;" closable />

    <el-card v-loading="loading" style="margin-top: 12px;">
      <template #header>
        <span>服务器状态（每 5 秒自动刷新）</span>
      </template>

      <el-descriptions v-if="status" :column="2" border>
        <el-descriptions-item label="运行状态">
          <el-tag :type="status.isRunning ? 'success' : 'danger'">
            {{ status.isRunning ? '运行中' : '已停止' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="PID">
          {{ status.pid ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="当前任务">
          {{ status.activeMissionTemplate ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="服务器模组数">
          {{ status.serverModCount ?? '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button type="success" @click="execAction('start')" :disabled="status?.isRunning" :loading="executing">
        启动
      </el-button>
      <el-button type="warning" @click="execAction('restart')" :disabled="!status?.isRunning" :loading="executing">
        重启
      </el-button>
      <el-button type="danger" @click="execAction('stop')" :disabled="!status?.isRunning" :loading="executing">
        停止
      </el-button>
      <el-button @click="loadStatus" :loading="loading">刷新</el-button>
    </div>
  </div>
</template>
