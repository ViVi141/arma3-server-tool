<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { PreflightIssue } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const issues = ref<PreflightIssue[]>([]);
const loading = ref(false);
const hasRun = ref(false);
const hasBlockingErrors = ref(false);

async function runPreflight() {
  loading.value = true;
  hasRun.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.preflight(props.serverUuid);
    if (!res.success) {
      throw new Error(res.error ?? "体检失败");
    }
    issues.value = res.data.issues ?? [];
    hasBlockingErrors.value = !!res.data.hasBlockingErrors;
    if (hasBlockingErrors.value) {
      ElMessage.warning("存在阻塞性问题，请先修复后再启动");
    } else {
      ElMessage.success("体检完成");
    }
  } catch (e: unknown) {
    issues.value = [{
      category: "错误",
      severity: "error",
      message: e instanceof Error ? e.message : "检查失败",
    }];
    hasBlockingErrors.value = true;
  } finally {
    loading.value = false;
  }
}

function severityTag(severity: PreflightIssue["severity"]): "success" | "warning" | "danger" | "info" {
  if (severity === "ok") {
    return "success";
  }
  if (severity === "warning") {
    return "warning";
  }
  if (severity === "info") {
    return "info";
  }
  return "danger";
}
</script>

<template>
  <ConsolePageLayout>
    <template #toolbar>
      <span class="preflight-title">开服体检</span>
      <el-button type="primary" :loading="loading" @click="runPreflight">
        {{ hasRun ? "重新检查" : "开始检查" }}
      </el-button>
    </template>

    <el-alert
      v-if="hasRun && hasBlockingErrors"
      title="存在阻塞性问题，启动前请先修复"
      type="error"
      show-icon
      style="margin-bottom: 12px;"
    />

    <el-card v-if="hasRun">
      <el-table :data="issues" stripe>
        <el-table-column prop="category" label="类别" width="120" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="severityTag(row.severity)" size="small">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="详情" />
      </el-table>
    </el-card>
    <el-empty v-else description="点击「开始检查」运行开服体检" />
  </ConsolePageLayout>
</template>

<style scoped>
.preflight-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
}
</style>
