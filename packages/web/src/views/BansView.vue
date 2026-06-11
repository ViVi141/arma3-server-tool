<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const bans = ref<{ guid?: string; ip?: string; reason?: string; date?: string; name?: string }[]>([]);
const loading = ref(false);
const addForm = ref({ guid: "", reason: "手动封禁" });
const showAdd = ref(false);

async function loadBans() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const r = await fetch(`${store.active?.baseUrl}/api/v1/bans`);
    if (r.ok) bans.value = (await r.json()).data ?? [];
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

onMounted(loadBans);

async function addBan() {
  if (!addForm.value.guid) return;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "local_ban_add" as const, playerGuid: addForm.value.guid, reason: addForm.value.reason }],
    });
    showAdd.value = false;
    addForm.value = { guid: "", reason: "手动封禁" };
    await loadBans();
    ElMessage.success("封禁已添加");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "添加失败"); }
}

async function removeBan(guid?: string) {
  if (!guid) return;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "local_ban_remove" as const, playerGuid: guid }],
    });
    await loadBans();
    ElMessage.success("封禁已移除");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "移除失败"); }
}

async function rconKick(guid?: string) {
  if (!guid) return;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "rcon_kick" as const, playerId: guid, reason: "管理员操作" }],
    });
    ElMessage.success("踢出命令已发送");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "踢出失败"); }
}
</script>

<template>
  <div class="bans-page">
    <h2>封禁管理</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button @click="showAdd = true">添加封禁</el-button>
      <el-button @click="loadBans" :loading="loading">刷新</el-button>
    </div>

    <el-dialog v-model="showAdd" title="添加封禁" width="400px">
      <el-form label-width="80px">
        <el-form-item label="Steam ID">
          <el-input v-model="addForm.guid" placeholder="7656119..." />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="addForm.reason" placeholder="作弊/违规" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="addBan">封禁</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <el-card v-loading="loading">
      <el-table v-if="bans.length" :data="bans" stripe style="width: 100%">
        <el-table-column prop="guid" label="Steam ID" width="180" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="reason" label="原因" min-width="120" />
        <el-table-column prop="date" label="时间" width="180">
          <template #default="{ row }">{{ row.date?.slice(0, 19).replace('T', ' ') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="removeBan(row.guid)">解封</el-button>
            <el-button size="small" @click="rconKick(row.guid)">踢出</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="无封禁记录" />
    </el-card>
  </div>
</template>
