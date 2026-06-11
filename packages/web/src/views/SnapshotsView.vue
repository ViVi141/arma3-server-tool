<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const snapshots = ref<{ id: string; label: string; timestamp: string; files: string[] }[]>([]);
const loading = ref(false);
const creating = ref(false);
const label = ref("");

async function loadSnapshots() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const baseUrl = store.active?.baseUrl ?? "";
    const r = await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/snapshots`);
    if (r.ok) snapshots.value = (await r.json()).data ?? [];
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

onMounted(loadSnapshots);

async function createSnapshot() {
  creating.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const baseUrl = store.active?.baseUrl ?? "";
    await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.value || "手动快照" }),
    });
    label.value = "";
    await loadSnapshots();
  } catch { /* ignore */ }
  finally { creating.value = false; }
}

async function restoreSnapshot(id: string) {
  try {
    const client = store.getClient();
    if (!client) return;
    const baseUrl = store.active?.baseUrl ?? "";
    await fetch(`${baseUrl}/api/v1/servers/${props.serverUuid}/snapshots/${id}/restore`, { method: "POST" });
    await loadSnapshots();
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="snapshots-page">
    <h2>配置快照</h2>
    <div style="margin: 12px 0; display: flex; gap: 8px;">
      <el-input v-model="label" placeholder="快照备注" style="max-width: 300px;" />
      <el-button :loading="creating" @click="createSnapshot">创建快照</el-button>
      <el-button @click="loadSnapshots">刷新</el-button>
    </div>
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
  </div>
</template>
