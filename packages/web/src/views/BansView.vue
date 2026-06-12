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
  loading.value = true; try {
    const client = store.getClient(); if (!client) return;
    const r = await fetch(`${store.active?.baseUrl}/api/v1/bans`);
    if (r.ok) bans.value = (await r.json()).data ?? [];
  } catch {} finally { loading.value = false; }
}
onMounted(loadBans);
async function addBan() {
  if (!addForm.value.guid) return; try {
    const client = store.getClient(); if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "local_ban_add" as const, playerGuid: addForm.value.guid, reason: addForm.value.reason }] });
    showAdd.value = false; addForm.value = { guid: "", reason: "手动封禁" }; await loadBans(); ElMessage.success("添加成功");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "添加失败"); }
}
async function removeBan(guid?: string) {
  if (!guid) return; try {
    const client = store.getClient(); if (!client) return;
    await fetch(`${store.active?.baseUrl}/api/v1/bans/${guid}`, { method: "DELETE" });
    await loadBans(); ElMessage.success("已移除");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "移除失败"); }
}
async function saveLocal() {
  try {
    const client = store.getClient(); if (!client) return;
    await fetch(`${store.active?.baseUrl}/api/v1/bans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bans.value) });
    ElMessage.success("已保存");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); }
}
</script>
<template>
<div class="page">
<div class="toolbar">
  <el-button size="small" @click="loadBans" :loading="loading">读取本地</el-button>
  <el-button size="small" @click="showAdd = true">添加封禁</el-button>
  <el-button size="small" @click="saveLocal">保存本地封禁</el-button>
  <el-button size="small" type="danger" @click="bans.length && removeBan(bans[bans.length-1].guid)">删除选中</el-button>
</div>
<el-dialog v-model="showAdd" title="添加封禁" width="400px">
  <el-form label-width="80px"><el-form-item label="GUID/IP"><el-input v-model="addForm.guid" placeholder="Steam ID 或 IP"/></el-form-item>
  <el-form-item label="原因"><el-input v-model="addForm.reason" placeholder="作弊/违规"/></el-form-item>
  <el-form-item><el-button type="primary" @click="addBan">封禁</el-button></el-form-item></el-form>
</el-dialog>
<div class="body">
<el-table :data="bans" stripe size="small" @selection-change="(s:never)=>0">
  <el-table-column type="selection" width="36"/>
  <el-table-column prop="guid" label="GUID/IP/UID" width="200"/>
  <el-table-column prop="date" label="到期日期" width="160"><template #default="{row}">{{(row.date??'').slice(0,10)}}</template></el-table-column>
  <el-table-column prop="reason" label="原因" min-width="120"/>
  <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" @click="removeBan(row.guid)">删除</el-button></template></el-table-column>
</el-table>
<el-empty v-if="!bans.length" description="无封禁记录，点击「读取本地」加载"/>
</div></div>
</template>
<style scoped>
.page{height:100%;display:flex;flex-direction:column}
.toolbar{padding:4px 8px;display:flex;gap:4px;border-bottom:1px solid var(--el-border-color);flex-shrink:0}
.body{flex:1;overflow:auto;padding:8px}
</style>
