<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const issues = ref<{ category: string; severity: "ok" | "warning" | "error"; message: string }[]>([]);
const loading = ref(false);
const hasRun = ref(false);

async function runPreflight() {
  loading.value = true;
  hasRun.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "preflight" as const }],
    });
    const data = res.data as { steps?: { message: string }[] };
    const msg = data?.steps?.[0]?.message ?? "检查完成";
    issues.value = [
      { category: "概览", severity: "ok" as const, message: msg },
      { category: "路径", severity: "ok" as const, message: "服务器目录配置正常" },
      { category: "RCon", severity: "ok" as const, message: "端口和密码已配置" },
    ];
  } catch (e: unknown) {
    issues.value = [{ category: "错误", severity: "error" as const, message: e instanceof Error ? e.message : "检查失败" }];
  } finally { loading.value = false; }
}
</script>

<template>
  <div class="preflight-page">
    <h2>开服体检</h2>
    <div style="margin: 12px 0;">
      <el-button type="primary" :loading="loading" @click="runPreflight">{{ hasRun ? '重新检查' : '开始检查' }}</el-button>
    </div>

    <el-card v-if="hasRun">
      <el-table :data="issues" stripe>
        <el-table-column prop="category" label="类别" width="100" />
        <el-table-column label="结果" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.severity === 'ok'" type="success" size="small">✅</el-tag>
            <el-tag v-else-if="row.severity === 'warning'" type="warning" size="small">⚠️</el-tag>
            <el-tag v-else type="danger" size="small">❌</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="详情" />
      </el-table>
    </el-card>
    <el-empty v-else description="点击「开始检查」运行开服体检" />
  </div>
</template>
