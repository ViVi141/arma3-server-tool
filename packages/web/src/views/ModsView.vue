<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const modIdsText = ref("");
const loading = ref(false);
const scanning = ref(false);
const mode = ref<"download" | "enable" | "download_and_enable">("download_and_enable");
const writeCfg = ref(false);
const modList = ref<{ name: string; workshopId: number; enabled: boolean; isServerMod: boolean; bikey: boolean; size: string }[]>([]);
const hasScanned = ref(false);

onMounted(loadMods);

async function loadMods() {
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data;
      // Parse modIds from config and try to build a list
      const enabledIds = (cfg.mods as { enabledIds?: number[] })?.enabledIds ?? [];
      const serverModIds = (cfg.mods as { serverModIds?: number[] })?.serverModIds ?? [];
      modList.value = enabledIds.map((id: number) => ({
        name: `workshop_${id}`,
        workshopId: id,
        enabled: true,
        isServerMod: serverModIds.includes(id),
        bikey: false,
        size: "-",
      }));
      hasScanned.value = true;
    }
  } catch { /* ignore */ }
}

async function doScan() {
  scanning.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "scan_mods" }],
    });
    const data = res.data as { steps?: { message: string }[] };
    const msg = data?.steps?.[0]?.message ?? "扫描完成";
    ElMessage.success(msg);
    await loadMods();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "扫描失败");
  } finally {
    scanning.value = false;
  }
}

async function doAction() {
  const ids = modIdsText.value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0);

  if (ids.length === 0) return;

  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;

    const commands: { action: string; modIds?: number[]; writeCfgAfter?: boolean; enableModsOnServer?: boolean }[] = [];
    if (mode.value === "enable" || mode.value === "download_and_enable") {
      commands.push({ action: "enable_mods", modIds: ids, writeCfgAfter: writeCfg.value });
    }
    if (mode.value === "download" || mode.value === "download_and_enable") {
      commands.push({
        action: "download_mods",
        modIds: ids,
        enableModsOnServer: mode.value === "download_and_enable",
      });
    }

    const res = await client.submitTask({ serverUuid: props.serverUuid, async: true, commands });
    const data = res.data as { taskId?: string; status?: string };
    ElMessage.success(data?.taskId ? `任务已提交: ${data.taskId.slice(0, 8)}...` : "操作已执行");
    await loadMods();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  } finally {
    loading.value = false;
  }
}

async function toggleMod(id: number, enabled: boolean) {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: enabled ? "enable_mods" : "disable_mods", modIds: [id], writeCfgAfter: writeCfg.value }],
    });
    const mod = modList.value.find((m) => m.workshopId === id);
    if (mod) mod.enabled = enabled;
    ElMessage.success(mod ? `${mod.name} 已${enabled ? "启用" : "禁用"}` : "操作完成");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}
</script>

<template>
  <div class="mods-page">
    <h2>模组管理</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button :loading="scanning" @click="doScan">扫描模组</el-button>
    </div>

    <el-card style="margin-top: 12px;">
      <template #header><span>模组列表</span></template>
      <el-table v-if="hasScanned && modList.length" :data="modList" stripe style="width: 100%">
        <el-table-column label="启用" width="70">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" size="small" @change="(v: boolean) => toggleMod(row.workshopId, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="200" />
        <el-table-column prop="workshopId" label="Workshop ID" width="130" />
        <el-table-column label="Bikey" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.bikey" type="success" size="small">🟢</el-tag>
            <el-tag v-else type="danger" size="small">🔴</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服模" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.isServerMod" type="warning" size="small">S</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else-if="hasScanned" description="无模组数据" />
      <el-empty v-else description="点击「扫描模组」查看已安装模组" />
    </el-card>

    <el-card style="margin-top: 12px;">
      <template #header><span>添加模组</span></template>
      <el-form label-width="100px">
        <el-form-item label="Workshop ID">
          <el-input v-model="modIdsText" type="textarea" :rows="3" placeholder="输入 Workshop ID，每行一个或用逗号分隔" />
        </el-form-item>
        <el-form-item label="操作模式">
          <el-radio-group v-model="mode">
            <el-radio value="download_and_enable">下载并启用</el-radio>
            <el-radio value="download">仅下载</el-radio>
            <el-radio value="enable">仅启用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="写入服务器">
          <el-switch v-model="writeCfg" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="doAction" :disabled="!modIdsText.trim()">执行</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
