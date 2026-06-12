<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { AutomationCommand, AsyncTaskResponse, ModMetaRow, ModScanPathEntry } from "@a3st/api-client";
import PathInput from "@/components/PathInput.vue";
import { isElectron, pickDirectory, pickFile, readTextFile } from "@/utils/electron";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const router = useRouter();

function goToSteamCmd() {
  router.replace({ path: `/console/${props.connectionId}/steamcmd` });
}

function commandsNeedSteamCmd(commands: AutomationCommand[]): boolean {
  for (const cmd of commands) {
    if (cmd.action === "download_mods" || cmd.action === "import_mods_html") {
      return true;
    }
  }
  return false;
}

async function submitModTask(commands: AutomationCommand[], label: string) {
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.submitTask({
    serverUuid: props.serverUuid,
    async: true,
    commands,
  });
  const taskId = (res.data as AsyncTaskResponse).taskId;
  if (!taskId) {
    throw new Error("未收到任务 ID");
  }
  const finalTask = await client.pollTask(taskId, 2000, 900000);
  if (finalTask.status !== "Succeeded") {
    throw new Error(finalTask.error ?? `${label} 失败`);
  }
  const steps = finalTask.data?.steps ?? [];
  const lastStep = steps[steps.length - 1];
  if (commandsNeedSteamCmd(commands)) {
    goToSteamCmd();
  }
  return lastStep?.message ?? `${label} 完成`;
}

interface ModRow {
  name: string;
  workshopId: number;
  path: string;
  enabled: boolean;
  isServerMod: boolean;
  isClientMod: boolean;
  isHcMod: boolean;
  isLocalMod: boolean;
  bikey: boolean;
  size: string;
  updated: string;
}

const modList = ref<ModRow[]>([]);
const loading = ref(false);
const scanning = ref(false);
const hasScanned = ref(false);

// Add mod by ID
const modIdsText = ref("");
const mode = ref<"download_and_enable" | "download" | "enable">("download_and_enable");
const writeCfg = ref(false);
const adding = ref(false);

// HTML Import
const htmlFileInput = ref<HTMLInputElement | null>(null);
const htmlFileName = ref("");
const htmlText = ref("");
const parsedMods = ref<{ id: number; name: string }[]>([]);
const htmlImporting = ref(false);
const htmlParsed = ref(false);

// Bikey
const showBikeyDialog = ref(false);
const bikeyMods = ref<{ name: string; workshopId: number; bikeyPresent: boolean }[]>([]);
const bikeyFiles = ref<{ name: string; size: number }[]>([]);
const bikeyKeysDir = ref("");
const copyingBikey = ref(false);
const bikeySummary = ref("Bikey 就绪: —");

// DLC
const dlcMods = ref({ contact: false, gm: false, csla: false, ws: false, vn: false });

function formatSize(bytes?: number): string {
  if (!bytes) {
    return "-";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function loadDlcFromConfig(cfg: Record<string, unknown>) {
  const startup = (cfg.startup ?? {}) as Record<string, unknown>;
  dlcMods.value = {
    contact: !!startup.dlcContact,
    gm: !!startup.dlcGm,
    csla: !!startup.dlcCsla,
    ws: !!startup.dlcWs,
    vn: !!startup.dlcVn,
  };
}

async function saveDlc() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.patchConfig(props.serverUuid, {
      startup: {
        dlcContact: dlcMods.value.contact,
        dlcGm: dlcMods.value.gm,
        dlcCsla: dlcMods.value.csla,
        dlcWs: dlcMods.value.ws,
        dlcVn: dlcMods.value.vn,
      },
    } as never);
    ElMessage.success("DLC 设置已保存");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

async function loadBikeySummary() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getBikeySummary(props.serverUuid);
    if (res.success) {
      const s = res.data;
      bikeySummary.value = `Bikey 就绪: ${s.ready}/${s.enabled}（缺失 ${s.missingBikey}）`;
    }
  } catch {
    bikeySummary.value = "Bikey 就绪: —";
  }
}
// Scan paths
const showScanPathDialog = ref(false);
const scanPaths = ref<ModScanPathEntry[]>([]);
// Sort / Filter
const sortMode = ref("scanOrder");
const visibilityFilter = ref("all");
const savingScanPaths = ref(false);

onMounted(() => {
  loadMods();
  loadBikeySummary();
});

function mapModRow(m: ModMetaRow, clientModIds: number[], hcModIds: number[]): ModRow {
  return {
    name: m.name,
    workshopId: m.workshopId,
    path: m.path,
    enabled: m.enabled,
    isServerMod: m.isServerMod,
    isClientMod: m.isClientMod ?? clientModIds.includes(m.workshopId),
    isHcMod: m.isHcMod ?? hcModIds.includes(m.workshopId),
    isLocalMod: !!m.isLocalMod,
    bikey: !!m.bikeyPresent,
    size: formatSize(m.sizeBytes),
    updated: "-",
  };
}

async function loadMods() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const cfgRes = await client.getConfig(props.serverUuid);
    if (!cfgRes.success) {
      return;
    }
    await loadDlcFromConfig(cfgRes.data as Record<string, unknown>);
    const cfg = cfgRes.data;
    const clientModIds = (cfg.mods as { clientModIds?: number[] })?.clientModIds ?? [];
    const hcModIds = (cfg.mods as { hcModIds?: number[] })?.hcModIds ?? [];

    const scanRes = await client.getModScan(props.serverUuid);
    if (scanRes.success) {
      modList.value = scanRes.data.mods.map((m) => mapModRow(m, clientModIds, hcModIds));
      hasScanned.value = true;
      return;
    }

    const enabledIds = (cfg.mods as { enabledIds?: number[] })?.enabledIds ?? [];
    const serverModIds = (cfg.mods as { serverModIds?: number[] })?.serverModIds ?? [];
    modList.value = enabledIds.map((id: number) => ({
      name: `workshop_${id}`,
      workshopId: id,
      path: "",
      enabled: true,
      isServerMod: serverModIds.includes(id),
      isClientMod: clientModIds.includes(id),
      isHcMod: hcModIds.includes(id),
      isLocalMod: false,
      bikey: false,
      size: "-",
      updated: "-",
    }));
    hasScanned.value = true;
  } catch {
    /* ignore */
  }
}

async function doScan() {
  scanning.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "scan_mods" as const }],
    });
    const steps = (res.data as { steps?: { success?: boolean; message?: string }[] })?.steps ?? [];
    const lastStep = steps[steps.length - 1];
    if (!res.success || (lastStep && lastStep.success === false)) {
      throw new Error(lastStep?.message ?? res.error ?? "扫描失败");
    }
    ElMessage.success(lastStep?.message ?? "扫描完成");
    await loadMods();
    await loadBikeySummary();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "扫描失败");
  } finally {
    scanning.value = false;
  }
}

async function doAddMods() {
  const ids = modIdsText.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  if (!ids.length) {
    return;
  }
  adding.value = true;
  try {
    const cmds: AutomationCommand[] = [];
    if (mode.value === "enable" || mode.value === "download_and_enable") {
      cmds.push({ action: "enable_mods", modIds: ids, writeCfgAfter: writeCfg.value });
    }
    if (mode.value === "download" || mode.value === "download_and_enable") {
      cmds.push({ action: "download_mods", modIds: ids });
    }
    const message = await submitModTask(cmds, "模组任务");
    ElMessage.success(message);
    await loadMods();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  } finally {
    adding.value = false;
  }
}

async function toggleMod(row: ModRow, enabled: boolean) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    if (row.isLocalMod && row.path) {
      const cfgRes = await client.getConfig(props.serverUuid);
      if (!cfgRes.success) {
        return;
      }
      const currentPaths = (cfgRes.data.mods as { enabledLocalPaths?: string[] })?.enabledLocalPaths ?? [];
      let enabledLocalPaths = [...currentPaths];
      if (enabled) {
        const exists = enabledLocalPaths.some((p) => p.toLowerCase() === row.path.toLowerCase());
        if (!exists) {
          enabledLocalPaths.push(row.path);
        }
      } else {
        enabledLocalPaths = enabledLocalPaths.filter((p) => p.toLowerCase() !== row.path.toLowerCase());
      }
      await client.patchConfig(props.serverUuid, { mods: { enabledLocalPaths } } as never);
    } else {
      await client.submitTask({
        serverUuid: props.serverUuid,
        commands: [{
          action: enabled ? "enable_mods" as never : "disable_mods" as never,
          modIds: [row.workshopId],
          writeCfgAfter: writeCfg.value,
        }],
      });
    }
    row.enabled = enabled;
    ElMessage.success(`${row.name} 已${enabled ? "启用" : "禁用"}`);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

// ---- Get mods dropdown ----
function onGetMods(action: string) {
  switch (action) {
    case "add_local":
      addLocalModPath();
      break;
    case "scan_paths":
      openScanPathDialog();
      break;
    case "download":
      doAddMods();
      break;
    case "paste":
      navigator.clipboard.readText().then((t) => {
        modIdsText.value = t;
        ElMessage.success("已从剪贴板导入");
      });
      break;
    case "html_download":
      htmlFileInput.value?.click();
      break;
    case "html_enable":
      htmlFileInput.value?.click();
      break;
  }
}

async function addLocalModPath() {
  const picked = await pickDirectory();
  if (!picked) {
    if (!isElectron()) {
      ElMessage.info("路径浏览需在 Electron 桌面版中使用");
    } else {
      ElMessage.info("请选择本地模组目录");
    }
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const cfgRes = await client.getConfig(props.serverUuid);
    if (!cfgRes.success) {
      return;
    }
    const modsCfg = (cfgRes.data.mods ?? {}) as {
      localMods?: { path: string; name?: string; enabled?: boolean }[];
      enabledLocalPaths?: string[];
    };
    const localMods = modsCfg.localMods ?? [];
    const enabledLocalPaths = modsCfg.enabledLocalPaths ?? [];
    if (localMods.some((entry) => entry.path.toLowerCase() === picked.toLowerCase())) {
      ElMessage.warning("该本地模组路径已存在");
      return;
    }
    const folderName = picked.split(/[/\\]/).pop() ?? picked;
    await client.patchConfig(props.serverUuid, {
      mods: {
        localMods: [...localMods, { path: picked, name: folderName, enabled: true }],
        enabledLocalPaths: [...new Set([...enabledLocalPaths, picked])],
      },
    } as never);
    ElMessage.success("本地模组已添加");
    await doScan();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "添加失败");
  }
}

async function openScanPathDialog() {
  showScanPathDialog.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getModScanPaths();
    if (res.success) {
      scanPaths.value = [...res.data.paths];
    }
  } catch {
    scanPaths.value = [];
  }
}

function addScanPathRow() {
  scanPaths.value.push({ modulePath: "", remark: "" });
}

async function saveScanPaths() {
  savingScanPaths.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.saveModScanPaths(scanPaths.value.filter((p) => p.modulePath.trim()));
    ElMessage.success("扫描路径已保存");
    showScanPathDialog.value = false;
    await doScan();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    savingScanPaths.value = false;
  }
}

// ---- Disable all ----
async function disableMods(scope: "client" | "server" | "hc" | "all") {
  let ids: number[] = [];
  if (scope === "all") {
    ids = modList.value.filter((m) => m.enabled).map((m) => m.workshopId);
  } else if (scope === "server") {
    ids = modList.value.filter((m) => m.isServerMod).map((m) => m.workshopId);
  } else if (scope === "client") {
    ids = modList.value.filter((m) => m.isClientMod).map((m) => m.workshopId);
  } else {
    ids = modList.value.filter((m) => m.isHcMod).map((m) => m.workshopId);
  }
  if (!ids.length) {
    return;
  }
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "disable_mods" as never, modIds: ids, scope }],
    });
    ElMessage.success(`已禁用 ${ids.length} 个模组 (${scope})`);
    await loadMods();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

// ---- Bikey ----
async function openBikeyDialog() {
  showBikeyDialog.value = true;
  bikeyMods.value = modList.value.map((m) => ({ name: m.name, workshopId: m.workshopId, bikeyPresent: m.bikey }));
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getBikeyFiles(props.serverUuid);
    if (res.success) {
      bikeyKeysDir.value = res.data.keysDir;
      bikeyFiles.value = res.data.files ?? [];
    }
  } catch {
    bikeyFiles.value = [];
  }
}
async function copyAllBikeys() {
  copyingBikey.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "copy_bikeys" as const }],
    });
    const msg = (res.data as { steps?: { message: string }[] })?.steps?.[0]?.message ?? "Bikey 复制完成";
    ElMessage.success(msg);
    await loadMods();
    await loadBikeySummary();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "复制失败");
  } finally {
    copyingBikey.value = false;
  }
}

async function setServerMod(id: number, isServer: boolean) {
  try {
    const client = store.getClient(); if (!client) return;
    const currentIds = modList.value.filter(m => m.isServerMod).map(m => m.workshopId);
    const newIds = isServer ? [...currentIds, id] : currentIds.filter(i => i !== id);
    await client.patchConfig(props.serverUuid, { mods: { serverModIds: newIds } } as never);
    const mod = modList.value.find(m => m.workshopId === id); if (mod) mod.isServerMod = isServer;
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}

async function setClientMod(id: number, isClient: boolean) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const currentIds = modList.value.filter((m) => m.isClientMod).map((m) => m.workshopId);
    const newIds = isClient ? [...currentIds, id] : currentIds.filter((i) => i !== id);
    await client.patchConfig(props.serverUuid, { mods: { clientModIds: newIds } } as never);
    const mod = modList.value.find((m) => m.workshopId === id);
    if (mod) {
      mod.isClientMod = isClient;
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

async function setHcMod(id: number, isHc: boolean) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const currentIds = modList.value.filter((m) => m.isHcMod).map((m) => m.workshopId);
    const newIds = isHc ? [...currentIds, id] : currentIds.filter((i) => i !== id);
    await client.patchConfig(props.serverUuid, { mods: { hcModIds: newIds } } as never);
    const mod = modList.value.find((m) => m.workshopId === id);
    if (mod) {
      mod.isHcMod = isHc;
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

// ---- HTML Import ----
async function pickHtmlFile() {
  if (isElectron()) {
    const picked = await pickFile([{ name: "HTML", extensions: ["html", "htm"] }]);
    if (!picked) {
      return;
    }
    const text = await readTextFile(picked);
    if (text === null) {
      ElMessage.error("读取 HTML 文件失败");
      return;
    }
    const parts = picked.split(/[/\\]/);
    htmlFileName.value = parts[parts.length - 1] ?? picked;
    htmlText.value = text;
    parseHtml();
    return;
  }
  htmlFileInput.value?.click();
}
async function onHtmlFileSelected(event: Event) {
  const input = event.target as HTMLInputElement; if (!input.files?.length) return;
  htmlFileName.value = input.files[0].name;
  const text = await input.files[0].text();
  htmlText.value = text; parseHtml(); input.value = "";
}
function parseHtml() {
  const items: { id: number; name: string }[] = [];
  const allIds = [...htmlText.value.matchAll(/(\d{7,})/g)].map(m => parseInt(m[1], 10)).filter(id => id > 1000000);
  const titles = [...htmlText.value.matchAll(/class="workshopItemTitle"[^>]*>([^<]+)</gi)].map(m => m[1].trim());
  items.push(...[...new Set(allIds)].map((id, i) => ({ id, name: titles[i] ?? `workshop_${id}` })));
  parsedMods.value = items; htmlParsed.value = true;
  if (!items.length) ElMessage.warning("未从 HTML 中解析出模组 ID");
}
async function doHtmlImport() {
  if (!parsedMods.value.length) {
    return;
  }
  htmlImporting.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.uploadModHtml(props.serverUuid, htmlText.value, {
      mode: "download_and_enable",
      writeCfg: writeCfg.value,
    });
    if (!res.success || !res.data.success) {
      throw new Error(res.data.message ?? res.error ?? "导入失败");
    }
    ElMessage.success(res.data.message ?? `已导入 ${parsedMods.value.length} 个模组`);
    goToSteamCmd();
    await loadMods();
    htmlText.value = "";
    parsedMods.value = [];
    htmlParsed.value = false;
    htmlFileName.value = "";
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "导入失败");
  } finally {
    htmlImporting.value = false;
  }
}

const filteredList = computed(() => {
  let list = [...modList.value];
  if (visibilityFilter.value === "selected") list = list.filter(m => m.enabled);
  if (visibilityFilter.value === "unselected") list = list.filter(m => !m.enabled);
  if (sortMode.value === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  if (sortMode.value === "id") list.sort((a, b) => a.workshopId - b.workshopId);
  return list;
});
</script>
<script lang="ts">import { computed } from "vue";</script>
<template>
<ConsolePageLayout>
<template #toolbar>
<div class="mods-toolbar">
  <el-button size="small" :loading="scanning" @click="doScan">扫描刷新</el-button>
  <el-dropdown size="small" @command="onGetMods"><el-button size="small">获取模组<el-icon class="el-icon--right"><arrow-down/></el-icon></el-button>
    <el-dropdown-menu slot="dropdown"><el-dropdown-item command="add_local">添加本地模组</el-dropdown-item><el-dropdown-item command="scan_paths">扫描路径...</el-dropdown-item><el-dropdown-item command="download">下载选中模组</el-dropdown-item><el-dropdown-item command="paste">从剪贴板导入 ID</el-dropdown-item><el-dropdown-item command="html_download">从 HTML 下载...</el-dropdown-item><el-dropdown-item command="html_enable">从 HTML 启用...</el-dropdown-item></el-dropdown-menu>
  </el-dropdown>
  <el-dropdown size="small" @command="disableMods">
    <el-button size="small">禁用范围</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="all">全部禁用</el-dropdown-item>
        <el-dropdown-item command="server">服模</el-dropdown-item>
        <el-dropdown-item command="client">客模</el-dropdown-item>
        <el-dropdown-item command="hc">HC 模</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <span style="font-size:11px;color:var(--el-text-color-secondary);margin-left:auto;">{{ bikeySummary }}</span>
</div>
<div class="mods-toolbar mods-toolbar--secondary">
  <span style="font-size:12px;">排序</span><el-select v-model="sortMode" size="small" style="width:120px"><el-option value="scanOrder" label="扫描顺序"/><el-option value="name" label="模组名"/><el-option value="id" label="Workshop ID"/></el-select>
  <span style="font-size:12px;margin-left:8px;">可见性</span><el-select v-model="visibilityFilter" size="small" style="width:130px"><el-option value="all" label="显示全部"/><el-option value="selected" label="仅已选择"/><el-option value="unselected" label="仅未选择"/></el-select>
  <el-checkbox v-model="dlcMods.contact" size="small" style="margin-left:12px;" @change="saveDlc">Contact</el-checkbox><el-checkbox v-model="dlcMods.gm" size="small" @change="saveDlc">GM</el-checkbox><el-checkbox v-model="dlcMods.csla" size="small" @change="saveDlc">CSLA</el-checkbox><el-checkbox v-model="dlcMods.ws" size="small" @change="saveDlc">WS</el-checkbox><el-checkbox v-model="dlcMods.vn" size="small" @change="saveDlc">VN</el-checkbox>
</div>
</template>
<el-table :data="filteredList" stripe size="small">
  <el-table-column label="启用" width="60"><template #default="{row}"><el-switch :model-value="row.enabled" size="small" @change="(v:boolean)=>toggleMod(row,v)"/></template></el-table-column>
  <el-table-column prop="name" label="名称" min-width="160"/>
  <el-table-column label="ID" width="110"><template #default="{row}"><span v-if="row.isLocalMod" style="color:var(--el-text-color-secondary);">本地</span><span v-else>{{ row.workshopId }}</span></template></el-table-column>
  <el-table-column label="Bikey" width="65"><template #default="{row}"><el-tag v-if="row.bikey" type="success" size="small">🟢</el-tag><el-tag v-else type="danger" size="small">🔴</el-tag></template></el-table-column>
  <el-table-column label="服模" width="55"><template #default="{row}"><el-switch :model-value="row.isServerMod" size="small" @change="(v:boolean)=>setServerMod(row.workshopId,v)"/></template></el-table-column>
  <el-table-column label="客模" width="55"><template #default="{row}"><el-switch :model-value="row.isClientMod" size="small" @change="(v:boolean)=>setClientMod(row.workshopId,v)"/></template></el-table-column>
  <el-table-column label="HC" width="50"><template #default="{row}"><el-switch :model-value="row.isHcMod" size="small" @change="(v:boolean)=>setHcMod(row.workshopId,v)"/></template></el-table-column>
  <el-table-column prop="size" label="大小" width="70"/>
  <el-table-column prop="updated" label="更新时间" width="90"/>
</el-table>

<!-- Add mods card -->
<el-card style="margin-top:8px;">
<template #header><span>添加模组</span></template>
<el-row :gutter="8">
<el-col :span="12">
<el-form label-width="80px" size="small">
  <el-form-item label="ID"><el-input v-model="modIdsText" type="textarea" :rows="2" placeholder="Workshop ID，每行一个"/></el-form-item>
  <el-form-item label="操作"><el-radio-group v-model="mode"><el-radio value="download_and_enable">下载并启用</el-radio><el-radio value="download">仅下载</el-radio><el-radio value="enable">仅启用</el-radio></el-radio-group></el-form-item>
  <el-form-item label="写 cfg"><el-switch v-model="writeCfg" size="small"/></el-form-item>
  <el-form-item><el-button type="primary" :loading="adding" @click="doAddMods" :disabled="!modIdsText.trim()">执行</el-button></el-form-item>
</el-form>
</el-col>
<el-col :span="12">
  <input type="file" accept=".html,.htm" ref="htmlFileInput" @change="onHtmlFileSelected" style="display:none"/>
  <el-button @click="pickHtmlFile">选择 HTML 文件...</el-button>
  <span v-if="htmlFileName" style="margin-left:8px;font-size:12px;color:var(--el-text-color-secondary)">{{ htmlFileName }}</span>
  <div v-if="htmlParsed" style="margin-top:8px;">
    <el-button type="primary" size="small" :loading="htmlImporting" @click="doHtmlImport" :disabled="!parsedMods.length">导入并下载 ({{ parsedMods.length }} 个)</el-button>
    <el-table v-if="parsedMods.length" :data="parsedMods" stripe size="small" style="margin-top:4px;">
      <el-table-column prop="name" label="模组名" min-width="140"/><el-table-column prop="id" label="ID" width="100"/>
    </el-table>
  </div>
</el-col>
</el-row>
</el-card>
<!-- Bikey Dialog -->
<el-dialog v-model="showBikeyDialog" title="Bikey 管理" width="640px">
<el-table :data="bikeyMods" stripe size="small">
  <el-table-column prop="name" label="模组" min-width="200"/><el-table-column prop="workshopId" label="ID" width="100"/>
  <el-table-column label="Bikey" width="70"><template #default="{row}"><el-tag v-if="row.bikeyPresent" type="success" size="small">🟢</el-tag><el-tag v-else type="danger" size="small">🔴</el-tag></template></el-table-column>
  <el-table-column label="服模" width="60"><template #default="{row}"><el-switch :model-value="modList.find(m=>m.workshopId===row.workshopId)?.isServerMod??false" size="small" @change="(v:boolean)=>setServerMod(row.workshopId,v)"/></template></el-table-column>
</el-table>
<p v-if="bikeyKeysDir" class="bikey-dir">keys 目录: {{ bikeyKeysDir }}（{{ bikeyFiles.length }} 个 .bikey）</p>
<el-table v-if="bikeyFiles.length" :data="bikeyFiles" stripe size="small" style="margin-top:8px;">
  <el-table-column prop="name" label="文件名" min-width="220" />
  <el-table-column label="大小" width="100">
    <template #default="{ row }">{{ Math.round(row.size / 1024) }} KB</template>
  </el-table-column>
</el-table>
<template #footer><el-button :loading="copyingBikey" @click="copyAllBikeys">复制缺失 Bikey</el-button><el-button @click="showBikeyDialog=false">关闭</el-button></template>
</el-dialog>
<el-dialog v-model="showScanPathDialog" title="模组扫描路径" width="640px">
  <el-table :data="scanPaths" stripe size="small">
    <el-table-column label="路径" min-width="320">
      <template #default="{ row }">
        <PathInput v-model="row.modulePath" mode="directory" placeholder="D:\Steam\steamapps\workshop\content\107410" />
      </template>
    </el-table-column>
    <el-table-column label="备注" width="140">
      <template #default="{ row }">
        <el-input v-model="row.remark" size="small" />
      </template>
    </el-table-column>
  </el-table>
  <div style="margin-top:8px;">
    <el-button size="small" @click="addScanPathRow">添加路径</el-button>
  </div>
  <template #footer>
    <el-button @click="showScanPathDialog=false">取消</el-button>
    <el-button type="primary" :loading="savingScanPaths" @click="saveScanPaths">保存</el-button>
  </template>
</el-dialog>
</ConsolePageLayout>
</template>
<style scoped>
.mods-toolbar{padding:4px 0;display:flex;gap:4px;align-items:center;flex-wrap:wrap;width:100%}
.mods-toolbar--secondary{border-top:1px solid var(--el-border-color);padding-top:6px;margin-top:2px}
</style>
