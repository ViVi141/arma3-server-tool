<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import DeployOpsBar from "@/components/console/DeployOpsBar.vue";
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { SnapshotEntry } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const snapshots = ref<SnapshotEntry[]>([]);
const loading = ref(false);
const creating = ref(false);
const label = ref("");

async function loadSnapshots() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.listSnapshots(props.serverUuid);
    if (res.success) {
      snapshots.value = res.data ?? [];
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadSnapshots);

async function createSnapshot() {
  creating.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.createSnapshot(props.serverUuid, label.value || "手动快照");
    label.value = "";
    await loadSnapshots();
    ElMessage.success("快照已创建");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "创建失败");
  } finally {
    creating.value = false;
  }
}

async function restoreSnapshot(id: string) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.restoreSnapshot(props.serverUuid, id);
    ElMessage.success("快照已恢复");
    await loadSnapshots();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "恢复失败");
  }
}
</script>

<template>
  <ConsolePageLayout>
    <DeployOpsBar />
    <template #toolbar>
      <span class="snapshots-title">配置快照</span>
      <el-input v-model="label" placeholder="快照备注" style="max-width: 300px;" />
      <el-button :loading="creating" @click="createSnapshot">创建快照</el-button>
      <el-button @click="loadSnapshots">刷新</el-button>
    </template>
    <el-card v-loading="loading">
      <el-table v-if="snapshots.length" :data="snapshots" stripe>
        <el-table-column prop="label" label="备注" min-width="150" />
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">{{ row.timestamp.slice(0, 19).replace('T', ' ') }}</template>
        </el-table-column>
        <el-table-column prop="files" label="文件数" width="80">
          <template #default="{ row }">{{ row.files?.length ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="restoreSnapshot(row.id)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无快照" />
    </el-card>
  </ConsolePageLayout>
</template>

<style scoped>
.snapshots-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
}
</style>
