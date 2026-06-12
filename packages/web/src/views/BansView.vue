<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { BanEntry } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const bans = ref<BanEntry[]>([]);
const loading = ref(false);
const addForm = ref({ guid: "", reason: "手动封禁" });
const showAdd = ref(false);
const selected = ref<BanEntry[]>([]);

async function loadBans() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getBans();
    if (res.success) {
      bans.value = res.data ?? [];
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "读取失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadBans);

async function addBan() {
  if (!addForm.value.guid) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{
        action: "local_ban_add" as const,
        playerGuid: addForm.value.guid,
        reason: addForm.value.reason,
      }],
    });
    showAdd.value = false;
    addForm.value = { guid: "", reason: "手动封禁" };
    await loadBans();
    ElMessage.success("添加成功");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "添加失败");
  }
}

async function removeBan(guid?: string) {
  if (!guid) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.removeBan(guid);
    await loadBans();
    ElMessage.success("已移除");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "移除失败");
  }
}

async function saveLocal() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.saveBans(bans.value);
    ElMessage.success("已保存");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

function removeSelected() {
  if (selected.value.length === 0) {
    ElMessage.warning("请先选择要删除的封禁");
    return;
  }
  const row = selected.value[0];
  removeBan(row.guid ?? row.ip);
}
</script>
<template>
<ConsolePageLayout>
<template #toolbar>
  <el-button size="small" @click="loadBans" :loading="loading">读取本地</el-button>
  <el-button size="small" @click="showAdd = true">添加封禁</el-button>
  <el-button size="small" @click="saveLocal">保存本地封禁</el-button>
  <el-button size="small" type="danger" @click="removeSelected">删除选中</el-button>
</template>
<el-dialog v-model="showAdd" title="添加封禁" width="400px">
  <el-form label-width="80px">
    <el-form-item label="GUID/IP"><el-input v-model="addForm.guid" placeholder="Steam ID 或 IP"/></el-form-item>
    <el-form-item label="原因"><el-input v-model="addForm.reason" placeholder="作弊/违规"/></el-form-item>
    <el-form-item><el-button type="primary" @click="addBan">封禁</el-button></el-form-item>
  </el-form>
</el-dialog>
<el-table :data="bans" stripe size="small" @selection-change="(rows: BanEntry[]) => { selected = rows; }">
  <el-table-column type="selection" width="36"/>
  <el-table-column prop="guid" label="GUID/IP/UID" width="200"/>
  <el-table-column prop="date" label="到期日期" width="160"><template #default="{row}">{{(row.date??'').slice(0,10)}}</template></el-table-column>
  <el-table-column prop="reason" label="原因" min-width="120"/>
  <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" @click="removeBan(row.guid ?? row.ip)">删除</el-button></template></el-table-column>
</el-table>
<el-empty v-if="!bans.length" description="无封禁记录，点击「读取本地」加载"/>
</ConsolePageLayout>
</template>
