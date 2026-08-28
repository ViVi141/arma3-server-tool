<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import ModDownloadConfirmDialog from "@/components/mods/ModDownloadConfirmDialog.vue";
import HtmlModEnableDialog from "@/components/mods/HtmlModEnableDialog.vue";
import ModBikeyListDialog from "@/components/mods/ModBikeyListDialog.vue";
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowDown } from "@element-plus/icons-vue";
import { useConnectionsStore } from "@/stores/connections";
import { useUiSettingsStore } from "@/stores/uiSettings";
import type {
  AutomationCommand,
  AsyncTaskResponse,
  ModBikeyStatus,
  ModMetaRow,
  ModScanPathEntry,
  SteamWorkshopModInfo,
} from "@a3st/api-client";
import PathInput from "@/components/PathInput.vue";
import { isElectron, openPath, pickDirectory, pickFile, readTextFile } from "@/utils/electron";
import { bikeyStatusIcon, bikeyStatusHint, bikeyStatusLabel, formatBikeySummary } from "@/utils/modBikeyIcon";
import { parseWorkshopIdsFromClipboard } from "@/utils/modClipboard";
import { extractTaskSteps, lastTaskStep, resolvePollTaskMessage, resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const uiSettings = useUiSettingsStore();
const router = useRouter();

interface ModRow {
  name: string;
  dirName: string;
  workshopId: number;
  path: string;
  enabled: boolean;
  updateSelected: boolean;
  isServerMod: boolean;
  isClientMod: boolean;
  isHcMod: boolean;
  isLocalMod: boolean;
  inputLocalMod: boolean;
  bikeyStatus: ModBikeyStatus | "unknown";
  bikeyLabel: string;
  bikeyHint: string;
  scanOrder: number;
  updatedTime: string;
  updatedAt?: string;
  remoteUpdatedLabel?: string;
  updateStatus?: "missing" | "up_to_date" | "outdated" | "unknown";
}

const modList = ref<ModRow[]>([]);
const scanning = ref(false);
const copyingBikey = ref(false);
const bikeySummary = ref("Bikey 就绪 · —");
const copyMissingEnabled = ref(false);
const autoCopyBikey = ref(true);
const dlcMods = ref({ contact: false, gm: false, csla: false, ws: false, vn: false });

const sortMode = ref<"scanOrder" | "dirName" | "name" | "updated">("scanOrder");
const visibilityFilter = ref<"all" | "selected" | "unselected">("all");

const showScanPathDialog = ref(false);
const scanPaths = ref<ModScanPathEntry[]>([]);
const savingScanPaths = ref(false);

const showDownloadConfirm = ref(false);
const pendingDownloadIds = ref<number[]>([]);

const showHtmlEnable = ref(false);
const htmlEnableEntries = ref<{ id: number; name: string }[]>([]);
const htmlFileInput = ref<HTMLInputElement | null>(null);
const htmlFlow = ref<"download" | "enable">("download");

const showBikeyList = ref(false);
const bikeyKeysDir = ref("");
const bikeyListFiles = ref<{ name: string; fullPath: string }[]>([]);

const steamCmdReady = ref(false);
const checkingUpdates = ref(false);
const autoCheckUpdates = ref(false);

function goToSteamCmd() {
  if (!uiSettings.showAdvancedSettings) {
    uiSettings.setShowAdvanced(true);
  }
  router.replace({ path: `/console/${props.connectionId}/steamcmd` });
}

function mapModRow(m: ModMetaRow): ModRow {
  const status = m.bikeyStatus ?? "unknown";
  return {
    name: m.name,
    dirName: m.dirName ?? m.path.split(/[/\\]/).pop() ?? m.name,
    workshopId: m.workshopId,
    path: m.path,
    enabled: m.enabled,
    updateSelected: false,
    isServerMod: m.isServerMod,
    isClientMod: m.isClientMod ?? false,
    isHcMod: m.isHcMod ?? false,
    isLocalMod: !!m.isLocalMod,
    inputLocalMod: !!m.inputLocalMod,
    bikeyStatus: status,
    bikeyLabel: m.bikeyLabel ?? bikeyStatusLabel(status),
    bikeyHint: bikeyStatusHint(status),
    scanOrder: m.scanOrder ?? 0,
    updatedTime: m.updatedTime ?? "-",
    updatedAt: m.updatedAt,
    remoteUpdatedLabel: m.remoteUpdatedLabel,
    updateStatus: m.updateStatus,
  };
}

function updateStatusLabel(status?: ModRow["updateStatus"]): string {
  switch (status) {
    case "missing":
      return "未安装";
    case "up_to_date":
      return "已最新";
    case "outdated":
      return "有更新";
    default:
      return "未知";
  }
}

function updateStatusTagType(status?: ModRow["updateStatus"]): "success" | "warning" | "info" | "danger" {
  switch (status) {
    case "up_to_date":
      return "success";
    case "outdated":
      return "warning";
    case "missing":
      return "info";
    default:
      return "danger";
  }
}

function buildLocalModRefs(rows: ModRow[] = modList.value) {
  return rows
    .filter((row) => row.workshopId > 0)
    .map((row) => ({
      modId: row.workshopId,
      path: row.path || undefined,
      updatedAt: row.updatedAt,
    }));
}

async function loadSteamCmdStatus() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.steamCmdStatus();
    steamCmdReady.value = !!res.success && !!res.data?.isInstalled;
  } catch {
    steamCmdReady.value = false;
  }
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
      bikeySummary.value = formatBikeySummary({
        enabled: s.enabled,
        ready: s.ready,
        notCopied: s.notCopied ?? 0,
        noKey: s.noKey ?? 0,
        unsigned: s.unsigned ?? 0,
        unchecked: s.unchecked ?? 0,
        allValid: s.allValid,
      });
      copyMissingEnabled.value = (s.notCopied ?? 0) > 0;
    }
  } catch {
    bikeySummary.value = "Bikey 就绪 · —";
    copyMissingEnabled.value = false;
  }
}

async function loadMods() {
  const client = store.getClient();
  if (!client) {
    return;
  }
  const cfgRes = await client.getConfig(props.serverUuid);
  if (!cfgRes.success) {
    return;
  }
  await loadDlcFromConfig(cfgRes.data as Record<string, unknown>);
  const modsSection = cfgRes.data.mods as { autoCopyBikey?: boolean } | undefined;
  if (modsSection?.autoCopyBikey !== undefined) {
    autoCopyBikey.value = modsSection.autoCopyBikey;
  }

  const scanRes = await client.getModScan(props.serverUuid);
  if (scanRes.success) {
    modList.value = scanRes.data.mods.map((m) => mapModRow(m));
  }
}

onMounted(() => {
  loadMods();
  loadBikeySummary();
  loadSteamCmdStatus();
});

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
    const steps = extractTaskSteps(res.data as never);
    const lastStep = steps[steps.length - 1];
    if (!res.success || (lastStep && lastStep.success === false)) {
      throw new Error(lastStep?.message ?? res.error ?? "扫描失败");
    }
    ElMessage.success(lastStep?.message ?? "扫描完成");
    await loadMods();
    await loadBikeySummary();
    if (autoCopyBikey.value) {
      await copyBikeys({ missingOnly: false, silent: true });
    }
    if (autoCheckUpdates.value) {
      await checkModUpdates({ silent: true });
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "扫描失败");
  } finally {
    scanning.value = false;
  }
}

async function persistModRolesFromList() {
  const client = store.getClient();
  if (!client) {
    return;
  }

  const clientModIds: number[] = [];
  const serverModIds: number[] = [];
  const hcModIds: number[] = [];
  const enabledIds: number[] = [];
  const localMods: {
    path: string;
    name?: string;
    enabled?: boolean;
    isServerMod?: boolean;
    isClientMod?: boolean;
    isHcMod?: boolean;
  }[] = [];
  const roleEntries: {
    path: string;
    dirName: string;
    workshopId: number;
    isClientMod: boolean;
    isServerMod: boolean;
    isHcMod: boolean;
  }[] = [];

  for (const row of modList.value) {
    roleEntries.push({
      path: row.path,
      dirName: row.dirName,
      workshopId: row.workshopId,
      isClientMod: row.isClientMod,
      isServerMod: row.isServerMod,
      isHcMod: row.isHcMod,
    });

    if (row.isLocalMod) {
      if (row.path) {
        localMods.push({
          path: row.path,
          name: row.name,
          enabled: row.enabled,
          isServerMod: row.isServerMod,
          isClientMod: row.isClientMod,
          isHcMod: row.isHcMod,
        });
      }
      continue;
    }
    if (row.workshopId <= 0) {
      continue;
    }
    if (row.isClientMod) {
      clientModIds.push(row.workshopId);
    }
    if (row.isServerMod) {
      serverModIds.push(row.workshopId);
    }
    if (row.isHcMod) {
      hcModIds.push(row.workshopId);
    }
    if (row.isClientMod || row.isServerMod || row.isHcMod) {
      enabledIds.push(row.workshopId);
    }
  }

  const res = await client.patchConfig(props.serverUuid, {
    mods: {
      clientModIds,
      serverModIds,
      hcModIds,
      enabledIds,
      localMods,
      roleEntries,
    },
  } as never);
  if (!res.success) {
    throw new Error(res.error ?? "保存模组设置失败");
  }
}

async function copyBikeysForPath(modPath: string) {
  const client = store.getClient();
  if (!client || !modPath) {
    return;
  }
  await client.submitTask({
    serverUuid: props.serverUuid,
    commands: [{ action: "copy_bikeys" as const, modPaths: [modPath] }],
  });
}

async function onRoleChange(row: ModRow, field: "client" | "server" | "hc", value: boolean) {
  if (field === "client") {
    row.isClientMod = value;
  } else if (field === "server") {
    row.isServerMod = value;
  } else {
    row.isHcMod = value;
  }
  row.enabled = row.isClientMod || row.isServerMod || row.isHcMod;
  try {
    await persistModRolesFromList();
    ElMessage.success("模组启用状态已保存");
    await copyBikeysForPath(row.path);
    await loadMods();
    await loadBikeySummary();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  }
}

async function disableMods(scope: "client" | "server" | "hc" | "all") {
  const client = store.getClient();
  if (!client) {
    return;
  }
  if (scope === "all") {
    for (const row of modList.value) {
      row.isClientMod = false;
      row.isServerMod = false;
      row.isHcMod = false;
      row.enabled = false;
    }
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "disable_mods" as const, modIds: [], scope: "all" }],
    });
    await loadMods();
    await loadBikeySummary();
    ElMessage.success("已禁用全部模组角色");
    return;
  }

  let ids: number[] = [];
  if (scope === "server") {
    ids = modList.value.filter((m) => m.isServerMod).map((m) => m.workshopId);
  } else if (scope === "client") {
    ids = modList.value.filter((m) => m.isClientMod).map((m) => m.workshopId);
  } else {
    ids = modList.value.filter((m) => m.isHcMod).map((m) => m.workshopId);
  }
  if (!ids.length) {
    return;
  }
  for (const row of modList.value) {
    if (!ids.includes(row.workshopId)) {
      continue;
    }
    if (scope === "server") {
      row.isServerMod = false;
    } else if (scope === "client") {
      row.isClientMod = false;
    } else {
      row.isHcMod = false;
    }
    row.enabled = row.isClientMod || row.isServerMod || row.isHcMod;
  }
  await client.submitTask({
    serverUuid: props.serverUuid,
    commands: [{ action: "disable_mods" as const, modIds: ids, scope }],
  });
  await loadMods();
  ElMessage.success(`已禁用 ${scope} 模组角色`);
}

async function copyBikeys(options?: { missingOnly?: boolean; silent?: boolean }) {
  copyingBikey.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{
        action: "copy_bikeys" as const,
        missingOnly: options?.missingOnly === true,
      }],
    });
    const step = lastTaskStep(res.data as never);
    const taskOk = res.success && step?.success !== false;
    const msg = step?.message ?? (res.data as { message?: string })?.message ?? "Bikey 操作完成";
    if (!options?.silent) {
      if (taskOk) {
        ElMessage.success(msg);
      } else {
        ElMessage.error(msg);
      }
    }
    await loadMods();
    await loadBikeySummary();
  } catch (e: unknown) {
    if (!options?.silent) {
      ElMessage.error(e instanceof Error ? e.message : "复制失败");
    }
  } finally {
    copyingBikey.value = false;
  }
}

async function saveAutoCopyBikey() {
  const client = store.getClient();
  if (!client) {
    return;
  }
  await client.patchConfig(props.serverUuid, {
    mods: { autoCopyBikey: autoCopyBikey.value },
  } as never);
  ElMessage.success("已保存 Bikey 设置");
}

async function fetchWorkshopDetails(modIds: number[]): Promise<SteamWorkshopModInfo[]> {
  const client = store.getClient();
  if (!client) {
    return [];
  }
  const res = await client.fetchWorkshopModDetails(modIds, buildLocalModRefs());
  if (!res.success) {
    throw new Error(res.error ?? "加载模组信息失败");
  }
  return res.data.mods;
}

async function checkModUpdates(options?: { silent?: boolean; modIds?: number[] }) {
  const ids =
    options?.modIds ??
    modList.value.filter((row) => row.workshopId > 0).map((row) => row.workshopId);
  if (!ids.length) {
    if (!options?.silent) {
      ElMessage.info("没有可检查的 Workshop 模组");
    }
    return;
  }

  checkingUpdates.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.fetchWorkshopModDetails(ids, buildLocalModRefs());
    if (!res.success) {
      throw new Error(res.error ?? "检查更新失败");
    }

    let outdatedCount = 0;
    for (const item of res.data.mods) {
      const row = modList.value.find((m) => m.workshopId === item.modId);
      if (!row) {
        continue;
      }
      if (item.title && !row.name.startsWith("workshop_")) {
        row.name = item.title;
      }
      row.remoteUpdatedLabel = item.timeUpdatedLabel ?? "-";
      row.updateStatus = item.updateStatus;
      if (item.updateStatus === "outdated") {
        row.updateSelected = true;
        outdatedCount += 1;
      }
    }

    if (!options?.silent) {
      ElMessage.success(
        outdatedCount > 0
          ? `发现 ${outdatedCount} 个模组有更新，已自动勾选`
          : "所有已安装模组均为最新"
      );
    }
  } catch (e: unknown) {
    if (!options?.silent) {
      ElMessage.error(e instanceof Error ? e.message : "检查更新失败");
    }
  } finally {
    checkingUpdates.value = false;
  }
}

function openDownloadConfirm(modIds: number[]) {
  if (!modIds.length) {
    ElMessage.info("没有可下载的 Workshop 模组 ID");
    return;
  }
  pendingDownloadIds.value = modIds;
  showDownloadConfirm.value = true;
}

async function runDownload(modIds: number[]) {
  if (!modIds.length) {
    ElMessage.info("请至少选择一个模组");
    return;
  }
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.submitTask({
    serverUuid: props.serverUuid,
    async: true,
    commands: [{ action: "download_mods" as const, modIds }],
  });
  if (!res.success) {
    throw new Error(res.error ?? "提交下载任务失败");
  }
  const taskId = (res.data as AsyncTaskResponse).taskId;
  if (!taskId) {
    throw new Error("未收到任务 ID");
  }
  goToSteamCmd();
  ElMessage.info("SteamCMD 已开始下载，请在终端查看进度");
  const finalTask = await client.pollTask(taskId, 2000, 900000);
  if (finalTask.status === "Failed") {
    throw new Error(resolvePollTaskMessage(finalTask as never, "下载失败"));
  }
  ElMessage.success(resolvePollTaskMessage(finalTask as never, "模组下载已完成"));
  await doScan();
}

async function onDownloadConfirm(ids: number[]) {
  try {
    await runDownload(ids);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "下载失败");
  }
}

function onGetMods(action: string) {
  switch (action) {
    case "add_local":
      addLocalModPath();
      break;
    case "download":
      const ids = modList.value.filter((m) => m.updateSelected && m.workshopId > 0).map((m) => m.workshopId);
      openDownloadConfirm(ids);
      break;
    case "paste":
      navigator.clipboard.readText().then((text) => {
        const ids = parseWorkshopIdsFromClipboard(text);
        if (!ids.length) {
          ElMessage.info("剪贴板中未找到 Workshop ID");
          return;
        }
        openDownloadConfirm(ids);
      });
      break;
    case "html_download":
      htmlFlow.value = "download";
      pickHtmlFile();
      break;
    case "html_enable":
      htmlFlow.value = "enable";
      pickHtmlFile();
      break;
    default:
      break;
  }
}

async function pickHtmlFile() {
  let text = "";
  if (isElectron()) {
    const picked = await pickFile([{ name: "HTML", extensions: ["html", "htm"] }]);
    if (!picked) {
      return;
    }
    const content = await readTextFile(picked);
    if (content === null) {
      ElMessage.error("读取 HTML 文件失败");
      return;
    }
    text = content;
  } else {
    htmlFileInput.value?.click();
    return;
  }
  await handleHtmlText(text);
}

async function onHtmlFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) {
    return;
  }
  const text = await input.files[0].text();
  input.value = "";
  await handleHtmlText(text);
}

function parseHtmlEntries(text: string): { id: number; name: string }[] {
  const items: { id: number; name: string }[] = [];
  const allIds = [...text.matchAll(/(\d{7,})/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((id) => id > 1000000);
  const titles = [...text.matchAll(/class="workshopItemTitle"[^>]*>([^<]+)</gi)].map((m) => m[1].trim());
  const unique = [...new Set(allIds)];
  for (let i = 0; i < unique.length; i++) {
    items.push({ id: unique[i], name: titles[i] ?? `workshop_${unique[i]}` });
  }
  return items;
}

async function handleHtmlText(text: string) {
  const entries = parseHtmlEntries(text);
  if (!entries.length) {
    ElMessage.warning("未从 HTML 中解析出模组 ID");
    return;
  }
  if (htmlFlow.value === "enable") {
    htmlEnableEntries.value = entries;
    showHtmlEnable.value = true;
    return;
  }
  openDownloadConfirm(entries.map((e) => e.id));
}

function isModInstalled(modId: number): boolean {
  return modList.value.some((m) => m.workshopId === modId && m.path);
}

async function applyHtmlEnable(payload: { modIds: number[]; target: "client" | "server" | "hc" | "all" }) {
  for (const id of payload.modIds) {
    let row = modList.value.find((m) => m.workshopId === id);
    if (!row) {
      modList.value.push({
        name: `workshop_${id}`,
        dirName: String(id),
        workshopId: id,
        path: "",
        enabled: false,
        updateSelected: false,
        isServerMod: false,
        isClientMod: false,
        isHcMod: false,
        isLocalMod: false,
        inputLocalMod: false,
        bikeyStatus: "unknown",
        bikeyLabel: "—",
        bikeyHint: "",
        scanOrder: modList.value.length,
        updatedTime: "-",
      });
      row = modList.value.find((m) => m.workshopId === id);
    }
    if (!row) {
      continue;
    }
    if (payload.target === "client" || payload.target === "all") {
      row.isClientMod = true;
    }
    if (payload.target === "server" || payload.target === "all") {
      row.isServerMod = true;
    }
    if (payload.target === "hc" || payload.target === "all") {
      row.isHcMod = true;
    }
    row.enabled = row.isClientMod || row.isServerMod || row.isHcMod;
  }
  await persistModRolesFromList();
  await doScan();
  ElMessage.success(`已启用 ${payload.modIds.length} 个模组`);
}

async function downloadMissingFromHtml(ids: number[]) {
  try {
    await runDownload(ids);
    ElMessage.info("下载完成后请在对话框中点击「刷新状态」");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "下载失败");
  }
}

async function addLocalModPath() {
  const picked = await pickDirectory();
  if (!picked) {
    if (!isElectron()) {
      ElMessage.info("路径浏览需在 Electron 桌面版中使用");
    }
    return;
  }
  const client = store.getClient();
  if (!client) {
    return;
  }
  const validRes = await client.validateModPath(picked);
  if (!validRes.success || !validRes.data.valid) {
    ElMessage.warning("所选目录不是有效的 Arma3 模组目录（缺少 addons）");
    return;
  }
  const cfgRes = await client.getConfig(props.serverUuid);
  if (!cfgRes.success) {
    return;
  }
  const modsCfg = (cfgRes.data.mods ?? {}) as {
    localMods?: { path: string; name?: string; enabled?: boolean; isServerMod?: boolean; isClientMod?: boolean }[];
    enabledLocalPaths?: string[];
  };
  const localMods = modsCfg.localMods ?? [];
  const enabledLocalPaths = modsCfg.enabledLocalPaths ?? [];
  if (localMods.some((e) => e.path.toLowerCase() === picked.toLowerCase())) {
    ElMessage.warning("该本地模组路径已存在");
    return;
  }
  const folderName = picked.split(/[/\\]/).pop() ?? picked;
  await client.patchConfig(props.serverUuid, {
    mods: {
      localMods: [...localMods, {
        path: picked,
        name: folderName,
        enabled: true,
        isServerMod: true,
        isClientMod: true,
        isHcMod: false,
      }],
      enabledLocalPaths: [...new Set([...enabledLocalPaths, picked])],
    },
  } as never);
  ElMessage.success("本地模组已添加");
  await doScan();
}

async function openScanPathDialog() {
  showScanPathDialog.value = true;
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getModScanPaths();
  if (res.success) {
    scanPaths.value = [...res.data.paths];
  }
}

function addScanPathRow() {
  scanPaths.value.push({ modulePath: "", remark: "" });
}

function removeScanPathRow() {
  if (scanPaths.value.length > 0) {
    scanPaths.value.pop();
  }
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

async function openBikeyListDialog() {
  const client = store.getClient();
  if (!client) {
    return;
  }
  const res = await client.getBikeyFiles(props.serverUuid);
  if (res.success) {
    bikeyKeysDir.value = res.data.keysDir;
    bikeyListFiles.value = (res.data.files ?? []).map((f) => ({
      name: f.name,
      fullPath: f.fullPath ?? `${res.data.keysDir}\\${f.name}`,
    }));
  }
  showBikeyList.value = true;
}

function onBikeyMenu(command: string) {
  if (command === "manage") {
    openBikeyListDialog();
    return;
  }
  if (command === "copy_all") {
    copyBikeys({ missingOnly: false });
  }
}

const filteredList = computed(() => {
  let list = [...modList.value];
  if (visibilityFilter.value === "selected") {
    list = list.filter((m) => m.enabled);
  } else if (visibilityFilter.value === "unselected") {
    list = list.filter((m) => !m.enabled);
  }
  if (sortMode.value === "dirName") {
    list.sort((a, b) => a.dirName.localeCompare(b.dirName));
  } else if (sortMode.value === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode.value === "updated") {
    list.sort((a, b) => b.updatedTime.localeCompare(a.updatedTime));
  } else {
    list.sort((a, b) => a.scanOrder - b.scanOrder);
  }
  return list;
});
</script>

<template>
  <ConsolePageLayout :padded="false">
    <template #toolbar>
      <el-button size="small" :loading="scanning" @click="doScan">扫描刷新</el-button>
      <el-button size="small" :loading="checkingUpdates" @click="checkModUpdates()">检查更新</el-button>
      <el-dropdown size="small" @command="onGetMods">
        <el-button size="small">
          获取模组<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="add_local">添加本地模组</el-dropdown-item>
            <el-dropdown-item command="download">下载选中模组</el-dropdown-item>
            <el-dropdown-item command="paste">从剪贴板导入 ID</el-dropdown-item>
            <el-dropdown-item command="html_download">从 HTML 下载...</el-dropdown-item>
            <el-dropdown-item command="html_enable">从 HTML 启用...</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown size="small" data-testid="bikey-menu" @command="onBikeyMenu">
        <el-button size="small">Bikey 管理</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="manage">管理 Bikey</el-dropdown-item>
            <el-dropdown-item command="copy_all">复制全部 Bikey</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" @click="openScanPathDialog">扫描路径...</el-button>
    </template>

    <div class="mods-shell">
        <div class="mods-bar mods-bar--first">
          <span class="mods-bar-label">排序</span>
          <el-select v-model="sortMode" size="small" style="width: 140px">
            <el-option value="scanOrder" label="扫描顺序" />
            <el-option value="dirName" label="文件夹名" />
            <el-option value="name" label="模组名" />
            <el-option value="updated" label="更新时间" />
          </el-select>
          <span class="mods-bar-label">可见性</span>
          <el-select v-model="visibilityFilter" size="small" style="width: 140px">
            <el-option value="all" label="显示全部" />
            <el-option value="selected" label="仅已选择" />
            <el-option value="unselected" label="仅未选择" />
          </el-select>
          <el-checkbox v-model="autoCheckUpdates" size="small">扫描后自动检查 Workshop 更新</el-checkbox>
        </div>

        <div class="mods-bar">
          <span class="mods-bar-label">全部禁用</span>
          <el-button size="small" @click="disableMods('client')">客户端</el-button>
          <el-button size="small" @click="disableMods('server')">服务器</el-button>
          <el-button size="small" @click="disableMods('hc')">无头客户端</el-button>
          <el-button size="small" @click="disableMods('all')">全部</el-button>
        </div>

        <div class="mods-bar mods-bikey-bar">
          <span class="bikey-summary">{{ bikeySummary }}</span>
          <el-button
            size="small"
            :loading="copyingBikey"
            :disabled="!copyMissingEnabled"
            data-testid="btn-copy-missing-bikey"
            @click="copyBikeys({ missingOnly: true })"
          >
            复制缺失 Bikey
          </el-button>
        </div>

        <div class="mods-table-wrap">
          <el-table :data="filteredList" stripe size="small" height="100%">
            <el-table-column label="序号" width="52" align="center">
              <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column label="更新" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.updateSelected" :disabled="row.workshopId <= 0" />
              </template>
            </el-table-column>
            <el-table-column prop="dirName" label="文件夹名" min-width="120" show-overflow-tooltip />
            <el-table-column prop="name" label="模组名" min-width="140" show-overflow-tooltip />
            <el-table-column label="客户端模组" width="88" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.isClientMod" size="small" @change="(v: boolean) => onRoleChange(row, 'client', v)" />
              </template>
            </el-table-column>
            <el-table-column label="服务器模组" width="88" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.isServerMod" size="small" @change="(v: boolean) => onRoleChange(row, 'server', v)" />
              </template>
            </el-table-column>
            <el-table-column label="无头客户端模组" width="110" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.isHcMod" size="small" @change="(v: boolean) => onRoleChange(row, 'hc', v)" />
              </template>
            </el-table-column>
            <el-table-column label="本地导入" width="72" align="center">
              <template #default="{ row }">{{ row.inputLocalMod ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="签名" width="88" align="center">
              <template #default="{ row }">
                <el-tooltip :content="row.bikeyHint" placement="top">
                  <span class="bikey-status-cell">
                    <span class="bikey-icon">{{ bikeyStatusIcon(row.bikeyStatus) }}</span>
                    <span class="bikey-label">{{ row.bikeyLabel }}</span>
                  </span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="path" label="路径" min-width="160" show-overflow-tooltip />
            <el-table-column label="远程更新" width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remoteUpdatedLabel ?? "-" }}</template>
            </el-table-column>
            <el-table-column prop="updatedTime" label="本地更新" width="140" show-overflow-tooltip />
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.workshopId > 0 && row.updateStatus"
                  size="small"
                  :type="updateStatusTagType(row.updateStatus)"
                >
                  {{ updateStatusLabel(row.updateStatus) }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mods-options">
          <el-checkbox v-model="autoCopyBikey" @change="saveAutoCopyBikey">
            扫描模组时自动复制 bikey 到服务器 Keys 目录
          </el-checkbox>
          <p class="mods-hint">提示：Keys 目录中多余的 bikey 不影响服务器运行，游戏按实际加载的模组按需使用密钥。</p>
          <div class="mods-dlc-row">
            <el-checkbox v-model="dlcMods.contact" @change="saveDlc">Contact 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.gm" @change="saveDlc">GM 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.csla" @change="saveDlc">CSLA 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.ws" @change="saveDlc">Western Sahara 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.vn" @change="saveDlc">S.O.G. 资料片</el-checkbox>
          </div>
          <p class="mods-hint">提示：DLC 选项仅作为启动命令行参数，不写入 server.cfg。</p>
        </div>
    </div>
  </ConsolePageLayout>

  <input type="file" accept=".html,.htm" ref="htmlFileInput" class="hidden-input" @change="onHtmlFileSelected" />

  <ModDownloadConfirmDialog
    v-model:visible="showDownloadConfirm"
    :mod-ids="pendingDownloadIds"
    :fetch-details="fetchWorkshopDetails"
    @confirm="onDownloadConfirm"
  />

  <HtmlModEnableDialog
    v-model:visible="showHtmlEnable"
    :entries="htmlEnableEntries"
    :is-installed="isModInstalled"
    :can-download="steamCmdReady"
    @confirm="applyHtmlEnable"
    @download-missing="downloadMissingFromHtml"
  />

  <ModBikeyListDialog
    v-model:visible="showBikeyList"
    :keys-dir="bikeyKeysDir"
    :files="bikeyListFiles"
  />

  <el-dialog v-model="showScanPathDialog" title="模组扫描路径" width="760px">
    <el-table :data="scanPaths" stripe size="small">
      <el-table-column label="扫描路径" min-width="280">
        <template #default="{ row }">
          <PathInput v-model="row.modulePath" mode="directory" placeholder="D:\Steam\steamapps\workshop\content\107410" />
        </template>
      </el-table-column>
      <el-table-column label="前缀过滤" width="120">
        <template #default="{ row }">
          <el-input v-model="row.prefix" size="small" placeholder="可选" />
        </template>
      </el-table-column>
      <el-table-column label="备注" width="140">
        <template #default="{ row }">
          <el-input v-model="row.remark" size="small" />
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top: 8px">
      <el-button size="small" @click="addScanPathRow">添加</el-button>
      <el-button size="small" :disabled="!scanPaths.length" @click="removeScanPathRow">删除</el-button>
    </div>
    <template #footer>
      <el-button @click="showScanPathDialog = false">取消</el-button>
      <el-button type="primary" :loading="savingScanPaths" @click="saveScanPaths">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mods-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  gap: 4px;
  padding: 6px 8px;
  box-sizing: border-box;
}
.mods-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.mods-bar-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mods-bikey-bar {
  justify-content: flex-start;
}
.bikey-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mods-bar--first {
  padding-top: 2px;
}
.mods-table-wrap {
  flex: 1;
  min-height: 200px;
}
.mods-options {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
  font-size: 12px;
}
.mods-dlc-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}
.mods-hint {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.bikey-icon {
  font-size: 14px;
}
.bikey-status-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1.2;
}
.bikey-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.hidden-input {
  display: none;
}
</style>
