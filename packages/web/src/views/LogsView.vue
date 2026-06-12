<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref } from "vue";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const logKind = ref<"rpt" | "battleye" | "all">("rpt");
const lines = ref<string[]>([]);
const loading = ref(false);
const errorMsg = ref("");

async function loadLogs() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const client = store.getClient();
    if (!client) throw new Error("无连接");
    const res = await client.readLogs(props.serverUuid, logKind.value);
    if (res.success) {
      lines.value = res.data.lines;
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ConsolePageLayout>
    <template #toolbar>
      <span class="logs-title">日志查看</span>
      <el-radio-group v-model="logKind">
        <el-radio-button value="rpt">RPT</el-radio-button>
        <el-radio-button value="battleye">BattlEye</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-button type="primary" :loading="loading" @click="loadLogs">加载</el-button>
    </template>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon style="margin-bottom: 12px;" />

    <el-card v-if="lines.length">
      <pre class="log-pre">{{ lines.join('\n') }}</pre>
    </el-card>

    <el-empty v-else-if="!loading" description="点击加载查看日志" />
  </ConsolePageLayout>
</template>

<style scoped>
.logs-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
}

.log-pre {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  margin: 0;
}
</style>
