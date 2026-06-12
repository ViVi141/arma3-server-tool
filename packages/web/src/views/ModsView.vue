<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const modList = ref<{ name: string; workshopId: number; enabled: boolean; isServerMod: boolean; isClientMod: boolean; isHcMod: boolean; bikey: boolean; size: string; updated: string }[]>([]);
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
const copyingBikey = ref(false);
const bikeySummary = ref("Bikey 就绪: —");

// DLC
const dlcMods = { contact: false, gm: false, csla: false, ws: false, vn: false };

// Sort / Filter
const sortMode = ref("scanOrder");
const visibilityFilter = ref("all");

onMounted(loadMods);

async function loadMods() {
  try {
    const client = store.getClient(); if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data;
      const enabledIds = (cfg.mods as { enabledIds?: number[] })?.enabledIds ?? [];
      const serverModIds = (cfg.mods as { serverModIds?: number[] })?.serverModIds ?? [];
      const clientModIds = (cfg.mods as { clientModIds?: number[] })?.clientModIds ?? [];
      const hcModIds = (cfg.mods as { hcModIds?: number[] })?.hcModIds ?? [];
      modList.value = enabledIds.map((id: number) => ({
        name: `workshop_${id}`, workshopId: id, enabled: true,
        isServerMod: serverModIds.includes(id), isClientMod: clientModIds.includes(id), isHcMod: hcModIds.includes(id),
        bikey: false, size: "-", updated: "-",
      }));
      hasScanned.value = true;
    }
  } catch { /* ignore */ }
}

async function doScan() {
  scanning.value = true; try {
    const client = store.getClient(); if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "scan_mods" as const }] });
    ElMessage.success((res.data as { steps?: { message: string }[] })?.steps?.[0]?.message ?? "扫描完成");
    await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "扫描失败"); } finally { scanning.value = false; }
}

async function doAddMods() {
  const ids = modIdsText.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  if (!ids.length) return; adding.value = true; try {
    const client = store.getClient(); if (!client) return;
    const cmds: { action: string; modIds?: number[]; writeCfgAfter?: boolean }[] = [];
    if (mode.value === "enable" || mode.value === "download_and_enable") cmds.push({ action: "enable_mods", modIds: ids, writeCfgAfter: writeCfg.value });
    if (mode.value === "download" || mode.value === "download_and_enable") cmds.push({ action: "download_mods", modIds: ids });
    await client.submitTask({ serverUuid: props.serverUuid, async: true, commands: cmds });
    ElMessage.success("任务已提交"); await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); } finally { adding.value = false; }
}

async function toggleMod(id: number, enabled: boolean) {
  try {
    const client = store.getClient(); if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: enabled ? "enable_mods" as never : "disable_mods" as never, modIds: [id], writeCfgAfter: writeCfg.value }] });
    const mod = modList.value.find(m => m.workshopId === id); if (mod) mod.enabled = enabled;
    ElMessage.success(mod ? `${mod.name} 已${enabled ? "启用" : "禁用"}` : "操作完成");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}

// ---- Get mods dropdown ----
function onGetMods(action: string) {
  switch (action) {
    case "add_local": ElMessage.info("请通过 Workshop ID 输入框添加"); break;
    case "download": doAddMods(); break;
    case "paste": navigator.clipboard.readText().then(t => { modIdsText.value = t; ElMessage.success("已从剪贴板导入"); }); break;
    case "html_download": htmlFileInput.value?.click(); break;
    case "html_enable": htmlFileInput.value?.click(); break;
  }
}

// ---- Disable all ----
async function disableMods(scope: "client" | "server" | "hc" | "all") {
  const ids = modList.value.filter(m => m.enabled).map(m => m.workshopId);
  if (!ids.length) return;
  try {
    const client = store.getClient(); if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "disable_mods" as never, modIds: ids }] });
    ElMessage.success(`已禁用 ${ids.length} 个模组 (${scope})`); await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}

// ---- Bikey ----
async function openBikeyDialog() {
  showBikeyDialog.value = true; bikeyMods.value = modList.value.map(m => ({ ...m, bikeyPresent: m.bikey }));
}
async function copyAllBikeys() {
  copyingBikey.value = true; try {
    const client = store.getClient(); if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "write_cfg" as never }] });
    ElMessage.success("Bikey 复制任务已提交"); await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "复制失败"); } finally { copyingBikey.value = false; }
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

// ---- HTML Import ----
function pickHtmlFile() { htmlFileInput.value?.click(); }
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
  if (!parsedMods.value.length) return; htmlImporting.value = true; try {
    const client = store.getClient(); if (!client) return;
    const res = await client.uploadModHtml(props.serverUuid, htmlText.value, { mode: "download_and_enable", writeCfg: writeCfg.value });
    if (res.success) { ElMessage.success(`导入成功: ${parsedMods.value.length} 个`); await loadMods(); htmlText.value = ""; parsedMods.value = []; htmlParsed.value = false; }
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "导入失败"); } finally { htmlImporting.value = false; }
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
<div class="mods-page">
<div class="toolbar">
  <el-button size="small" :loading="scanning" @click="doScan">扫描刷新</el-button>
  <el-dropdown size="small" @command="onGetMods"><el-button size="small">获取模组<el-icon class="el-icon--right"><arrow-down/></el-icon></el-button>
    <el-dropdown-menu slot="dropdown"><el-dropdown-item command="add_local">添加本地模组</el-dropdown-item><el-dropdown-item command="download">下载选中模组</el-dropdown-item><el-dropdown-item command="paste">从剪贴板导入 ID</el-dropdown-item><el-dropdown-item command="html_download">从 HTML 下载...</el-dropdown-item><el-dropdown-item command="html_enable">从 HTML 启用...</el-dropdown-item></el-dropdown-menu>
  </el-dropdown>
  <el-dropdown size="small"><el-button size="small">Bikey 管理<el-icon class="el-icon--right"><arrow-down/></el-icon></el-button>
    <el-dropdown-menu slot="dropdown"><el-dropdown-item @click="openBikeyDialog">管理 Bikey</el-dropdown-item><el-dropdown-item @click="copyAllBikeys">复制全部 Bikey</el-dropdown-item></el-dropdown-menu>
  </el-dropdown>
  <el-button size="small" @click="disableMods('all')">全部禁用</el-button>
  <span style="font-size:11px;color:var(--el-text-color-secondary);margin-left:auto;">{{ bikeySummary }}</span>
</div>
<div class="toolbar" style="border-top:none;">
  <span style="font-size:12px;">排序</span><el-select v-model="sortMode" size="small" style="width:120px"><el-option value="scanOrder" label="扫描顺序"/><el-option value="name" label="模组名"/><el-option value="id" label="Workshop ID"/></el-select>
  <span style="font-size:12px;margin-left:8px;">可见性</span><el-select v-model="visibilityFilter" size="small" style="width:130px"><el-option value="all" label="显示全部"/><el-option value="selected" label="仅已选择"/><el-option value="unselected" label="仅未选择"/></el-select>
  <el-checkbox v-model="dlcMods.contact" size="small" style="margin-left:12px;">Contact</el-checkbox><el-checkbox v-model="dlcMods.gm" size="small">GM</el-checkbox><el-checkbox v-model="dlcMods.csla" size="small">CSLA</el-checkbox><el-checkbox v-model="dlcMods.ws" size="small">WS</el-checkbox><el-checkbox v-model="dlcMods.vn" size="small">VN</el-checkbox>
</div>
<el-table :data="filteredList" stripe size="small" max-height="400">
  <el-table-column label="启用" width="60"><template #default="{row}"><el-switch :model-value="row.enabled" size="small" @change="(v:boolean)=>toggleMod(row.workshopId,v)"/></template></el-table-column>
  <el-table-column prop="name" label="名称" min-width="160"/>
  <el-table-column prop="workshopId" label="ID" width="110"/>
  <el-table-column label="Bikey" width="65"><template #default="{row}"><el-tag v-if="row.bikey" type="success" size="small">🟢</el-tag><el-tag v-else type="danger" size="small">🔴</el-tag></template></el-table-column>
  <el-table-column label="服模" width="55"><template #default="{row}"><el-switch :model-value="row.isServerMod" size="small" @change="(v:boolean)=>setServerMod(row.workshopId,v)"/></template></el-table-column>
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
    <el-table v-if="parsedMods.length" :data="parsedMods" stripe size="small" max-height="200" style="margin-top:4px;">
      <el-table-column prop="name" label="模组名" min-width="140"/><el-table-column prop="id" label="ID" width="100"/>
    </el-table>
  </div>
</el-col>
</el-row>
</el-card>
<!-- Bikey Dialog -->
<el-dialog v-model="showBikeyDialog" title="Bikey 管理" width="600px">
<el-table :data="bikeyMods" stripe size="small">
  <el-table-column prop="name" label="模组" min-width="200"/><el-table-column prop="workshopId" label="ID" width="100"/>
  <el-table-column label="Bikey" width="70"><template #default="{row}"><el-tag v-if="row.bikeyPresent" type="success" size="small">🟢</el-tag><el-tag v-else type="danger" size="small">🔴</el-tag></template></el-table-column>
  <el-table-column label="服模" width="60"><template #default="{row}"><el-switch :model-value="modList.find(m=>m.workshopId===row.workshopId)?.isServerMod??false" size="small" @change="(v:boolean)=>setServerMod(row.workshopId,v)"/></template></el-table-column>
</el-table>
<template #footer><el-button :loading="copyingBikey" @click="copyAllBikeys">复制缺失 Bikey</el-button><el-button @click="showBikeyDialog=false">关闭</el-button></template>
</el-dialog>
</div>
</template>
<style scoped>
.mods-page{height:100%;display:flex;flex-direction:column}
.toolbar{padding:4px 8px;display:flex;gap:4px;align-items:center;border-bottom:1px solid var(--el-border-color);flex-shrink:0;flex-wrap:wrap}
</style>
