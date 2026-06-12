<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { BanEntry } from "@a3st/api-client";
import { resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const bans = ref<BanEntry[]>([]);
const loading = ref(false);
const addForm = ref({ guid: "", reason: "手动封禁" });
const showAdd = ref(false);
const selected = ref<BanEntry[]>([]);

function banKey(entry: BanEntry): string {
  return (entry.guid ?? entry.ip ?? "").trim();
}

function normalizeBan(entry: BanEntry): BanEntry {
  return {
    guid: entry.guid ?? entry.ip ?? "",
    ip: entry.ip,
    reason: entry.reason ?? "",
    time: entry.time ?? entry.date ?? "",
    date: entry.date ?? entry.time ?? "",
    name: entry.name,
  };
}

async function loadBans() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getBans(props.serverUuid);
    if (res.success) {
      bans.value = (res.data ?? []).map(normalizeBan);
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "读取失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadBans);

async function addBan() {
  if (!addForm.value.guid.trim()) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{
        action: "local_ban_add" as const,
        playerGuid: addForm.value.guid.trim(),
        reason: addForm.value.reason,
      }],
    });
    showAdd.value = false;
    addForm.value = { guid: "", reason: "手动封禁" };
    await loadBans();
    const msg = resolveTaskMessage(res.data as never, "封禁已添加");
    if (taskSucceeded(res.data as never)) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "添加失败");
  }
}

async function removeBan(entry: BanEntry) {
  const key = banKey(entry);
  if (!key) {
    return;
  }
  bans.value = bans.value.filter((row) => banKey(row) !== key);
  await saveLocal();
}

async function saveLocal() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const payload = bans.value.map((row) => ({
      guid: row.guid ?? row.ip ?? "",
      time: row.time ?? row.date ?? "",
      reason: row.reason ?? "",
      name: row.name,
      ip: row.ip,
    }));
    await client.saveBans(props.serverUuid, payload);
    ElMessage.success("已保存到 bans.txt");
    await loadBans();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

function removeSelected() {
  if (selected.value.length === 0) {
    ElMessage.warning("请先选择要删除的封禁");
    return;
  }
  for (const row of selected.value) {
    const key = banKey(row);
    bans.value = bans.value.filter((item) => banKey(item) !== key);
  }
  saveLocal();
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
  <el-table-column prop="date" label="到期日期" width="160"><template #default="{row}">{{(row.date ?? row.time ?? '').slice(0,10)}}</template></el-table-column>
  <el-table-column prop="reason" label="原因" min-width="120"/>
  <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" @click="removeBan(row)">删除</el-button></template></el-table-column>
</el-table>
<el-empty v-if="!bans.length" description="无封禁记录，点击「读取本地」加载"/>
</ConsolePageLayout>
</template>
