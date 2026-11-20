import { ref, computed, inject, onMounted, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { canDeployModKeys, emptyModFilters, exportModRows, matchesModFilters, modSignatureRisk, restoreModFilters, signatureStates } from "@/utils/modWorkbench";
import { useConnectionsStore } from "@/stores/connections";
import { useBackgroundTasksStore } from "@/stores/backgroundTasks";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";
import type {
  AsyncTaskResponse,
  ModBikeyStatus,
  ModMetaRow,
  ModScanPathEntry,
  SteamWorkshopModInfo,
} from "@a3st/api-client";
import { isElectron, pickDirectory, pickFile, readTextFile } from "@/utils/electron";
import { bikeyStatusHint, bikeyStatusLabel, formatBikeySummary } from "@/utils/modBikeyIcon";
import { parseWorkshopIdsFromClipboard } from "@/utils/modClipboard";
import { extractTaskSteps, lastTaskStep } from "@/utils/taskSteps";

export interface ModRow {
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
  signatureEvidence?: ModMetaRow["signatureEvidence"];
  keySelected?: boolean;
  scanOrder: number;
  updatedTime: string;
  updatedAt?: string;
  remoteUpdatedLabel?: string;
  updateStatus?: "missing" | "up_to_date" | "outdated" | "unknown";
}

export function useModsPage(props: { connectionId: string; serverUuid: string }) {
  const store = useConnectionsStore();
  const bgTasks = useBackgroundTasksStore();
  const consoleActions = inject(CONSOLE_ACTIONS_KEY, null);
  const isMobile = import.meta.env.VITE_APP_MODE === "mobile";
  const expandedModPaths = ref<Record<string, boolean>>({});
  let sortSelectStyle: Record<string, string> = { width: "140px" };
  let scanPathDialogWidth = "760px";
  if (isMobile) {
    sortSelectStyle = { width: "100%", maxWidth: "100%" };
    scanPathDialogWidth = "92vw";
  }

  function modRowKey(row: ModRow): string {
    if (row.path) {
      return row.path;
    }
    return `${row.dirName}:${row.workshopId}`;
  }

  function toggleModPath(row: ModRow) {
    const key = modRowKey(row);
    const next = { ...expandedModPaths.value };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = true;
    }
    expandedModPaths.value = next;
  }

  const modList = ref<ModRow[]>([]);
  const scanning = ref(false);
  const copyingBikey = ref(false);
  const bikeySummary = ref("文件检查 · 未获取");
  const copyMissingEnabled = ref(false);
  const autoCopyBikey = ref(true);
  const dlcMods = ref({ contact: false, gm: false, csla: false, ws: false, vn: false });

  const sortMode = ref<"scanOrder" | "dirName" | "name" | "updated">("scanOrder");
  const filters = ref(emptyModFilters());
  const filterStorageKey = computed(() => `a3st:mods:filters:${encodeURIComponent(props.connectionId)}:${encodeURIComponent(props.serverUuid)}`);
  watch(filterStorageKey, (key) => {
    try { filters.value = restoreModFilters(localStorage.getItem(key)); }
    catch { filters.value = emptyModFilters(); }
    modList.value = [];
  }, { immediate: true, flush: "sync" });
  watch(filters, (value) => {
    try { localStorage.setItem(filterStorageKey.value, JSON.stringify(value)); }
    catch { /* 禁止本地存储时仍可使用筛选。 */ }
  }, { deep: true });
  const statusFilterChips = [
    { id: "all", label: "全部", testId: "mods-filter-all" },
    { id: "enabled", label: "已启用", testId: "mods-filter-enabled" },
    { id: "outdated", label: "有更新", testId: "mods-filter-outdated" },
    { id: "bikey", label: "签名待处理", testId: "mods-filter-bikey-issue" },
    { id: "attention", label: "本服已启用且需处理", testId: "mods-filter-attention" },
  ];
  function quickFilterValues(id: string) {
    const next = emptyModFilters();
    if (id === "enabled" || id === "attention") next.enabled = ["enabled"];
    if (id === "outdated") next.updates = ["outdated"];
    if (id === "bikey" || id === "attention") next.signatures = signatureStates.filter((s) => s !== "ready");
    return next;
  }
  function applyQuickFilter(id: string) { filters.value = quickFilterValues(id); }
  function isQuickFilterActive(id: string) { return JSON.stringify(filters.value) === JSON.stringify(quickFilterValues(id)); }
  const signatureCounts = computed(() => signatureStates.map((status) => ({
    status, label: bikeyStatusLabel(status), count: modList.value.filter((m) => m.bikeyStatus === status).length,
  })));
  const selectedKeyRows = computed(() => filteredList.value.filter((row) => row.keySelected && canDeployModKeys(row)));
  function selectVisibleKeys() {
    for (const row of filteredList.value) row.keySelected = canDeployModKeys(row);
  }
  function clearKeySelection() {
    for (const row of modList.value) row.keySelected = false;
  }
  async function copyFilteredList() {
    try {
      await navigator.clipboard.writeText(exportModRows(filteredList.value));
      ElMessage.success(`已复制当前筛选的 ${filteredList.value.length} 个模组及原因`);
    } catch { ElMessage.error("无法访问剪贴板，可改用 CSV 导出"); }
  }
  function exportFilteredCsv() {
    const url = URL.createObjectURL(new Blob([exportModRows(filteredList.value, true)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mods-${props.serverUuid}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deploySelectedKeys() {
    const contextKey = filterStorageKey.value;
    const selected = [...selectedKeyRows.value];
    if (!selected.length) return;
    try {
      await ElMessageBox.confirm(
        `目标实例：${props.serverUuid}。仅部署当前筛选中显式选择的 ${selected.length} 个模组公钥：\n${selected.map((m) => `${m.name} (${m.workshopId || "本地"}) — ${m.path}`).join("\n")}\n不会补签 PBO、禁用模组或关闭签名校验。`,
        "确认公钥部署范围", { confirmButtonText: "部署并复扫", cancelButtonText: "取消", type: "warning" },
      );
    } catch { return; }
    if (contextKey !== filterStorageKey.value) {
      ElMessage.warning("目标主机或实例已变化，请重新选择部署范围");
      return;
    }
    await copyBikeys({ modPaths: selected.map((m) => m.path) });
  }

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

  function mapModRow(m: ModMetaRow): ModRow {
    const status = m.bikeyStatus && signatureStates.includes(m.bikeyStatus) ? m.bikeyStatus : "unknown";
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
      bikeyLabel: bikeyStatusLabel(status),
      bikeyHint: bikeyStatusHint(status),
      signatureEvidence: m.signatureEvidence,
      keySelected: false,
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
    const res = await client.patchConfig(props.serverUuid, {
      startup: {
        dlcContact: dlcMods.value.contact,
        dlcGm: dlcMods.value.gm,
        dlcCsla: dlcMods.value.csla,
        dlcWs: dlcMods.value.ws,
        dlcVn: dlcMods.value.vn,
      },
    } as never);
    if (!res.success) {
      ElMessage.error(res.error ?? "保存失败");
      return;
    }
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
        bikeySummary.value = formatBikeySummary(s);
        copyMissingEnabled.value = (s.notCopied ?? 0) + (s.keyMismatch ?? 0) > 0;
      }
    } catch {
      bikeySummary.value = "文件检查 · 未获取";
      copyMissingEnabled.value = false;
    }
  }

  async function loadMods() {
    const contextKey = filterStorageKey.value;
    const uuid = props.serverUuid;
    const client = store.getClient();
    if (!client) {
      return;
    }
    const cfgRes = await client.getConfig(uuid);
    if (!cfgRes.success || contextKey !== filterStorageKey.value) {
      return;
    }
    await loadDlcFromConfig(cfgRes.data as Record<string, unknown>);
    const modsSection = cfgRes.data.mods as { autoCopyBikey?: boolean } | undefined;
    if (modsSection?.autoCopyBikey !== undefined) {
      autoCopyBikey.value = modsSection.autoCopyBikey;
    }

    const scanRes = await client.getModScan(uuid);
    if (scanRes.success && contextKey === filterStorageKey.value) {
      const selected = new Set(modList.value.filter((row) => row.keySelected).map(modRowKey));
      modList.value = scanRes.data.mods.map((m) => {
        const row = mapModRow(m);
        row.keySelected = selected.has(modRowKey(row)) && canDeployModKeys(row);
        return row;
      });
    }
  }

  watch(filterStorageKey, () => { void loadMods(); void loadBikeySummary(); });

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
    // 角色切换是"立即生效"的：先乐观更新，保存失败必须回滚，
    // 否则界面显示的加载角色会和服务器上的配置包不一致。
    const prev = {
      client: row.isClientMod,
      server: row.isServerMod,
      hc: row.isHcMod,
      enabled: row.enabled,
    };
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
      await consoleActions?.refreshSync();
      await copyBikeysForPath(row.path);
      await loadMods();
      await loadBikeySummary();
    } catch (e: unknown) {
      row.isClientMod = prev.client;
      row.isServerMod = prev.server;
      row.isHcMod = prev.hc;
      row.enabled = prev.enabled;
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
      await consoleActions?.refreshSync();
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
    await consoleActions?.refreshSync();
    ElMessage.success(`已禁用 ${scope} 模组角色`);
  }

  async function copyBikeys(options?: { missingOnly?: boolean; silent?: boolean; modPaths?: string[] }) {
    const paths = options?.modPaths ?? modList.value.filter((row) => canDeployModKeys(row) && (!options?.missingOnly || row.enabled)).map((row) => row.path);
    if (!paths.length) return;
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
          modPaths: paths,
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
    const res = await client.patchConfig(props.serverUuid, {
      mods: { autoCopyBikey: autoCopyBikey.value },
    } as never);
    if (!res.success) {
      ElMessage.error(res.error ?? "保存失败");
      return;
    }
    ElMessage.success("已保存 Bikey 设置");
    await consoleActions?.refreshSync();
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
            : modList.value.some((row) => row.workshopId > 0 && row.updateStatus !== "up_to_date")
              ? "未发现已确认更新，但仍有未安装或版本未知项，请检查列表"
              : "所有已检查模组均为最新"
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
    // 非阻塞：提交后交给全局后台任务 Store 轮询，页面停留在 ModsView，
    // 用顶栏之外的进度条/Snackbar 汇报进度，完成后再刷新扫描结果。
    await bgTasks.startTask(
      `下载模组（${modIds.length} 个）`,
      async () => taskId,
      async (task) => {
        if (task.status === "Succeeded") {
          await loadMods();
          await loadBikeySummary();
        }
      }
    );
  }

  async function onDownloadConfirm(ids: number[]) {
    try {
      await runDownload(ids);
    } catch (e: unknown) {
      ElMessage.error(e instanceof Error ? e.message : "下载失败");
    }
  }

  function downloadSelectedMods() {
    const ids = modList.value
      .filter((m) => m.updateSelected && m.workshopId > 0)
      .map((m) => m.workshopId);
    openDownloadConfirm(ids);
  }

  function downloadOutdatedMods() {
    const ids = modList.value
      .filter((m) => m.updateStatus === "outdated" && m.workshopId > 0)
      .map((m) => m.workshopId);
    if (!ids.length) {
      ElMessage.info("没有标记为「有更新」的模组；请先点「检查更新」");
      return;
    }
    openDownloadConfirm(ids);
  }

  function onGetMods(action: string) {
    switch (action) {
      case "add_local":
        addLocalModPath();
        break;
      case "download":
        downloadSelectedMods();
        break;
      case "download_outdated":
        downloadOutdatedMods();
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
    await consoleActions?.refreshSync();
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
    const res = await client.patchConfig(props.serverUuid, {
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
    if (!res.success) {
      ElMessage.error(res.error ?? "添加本地模组失败");
      return;
    }
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
      selectVisibleKeys();
      void deploySelectedKeys();
    }
  }

  const filteredList = computed(() => {
    const list = modList.value.filter((row) => matchesModFilters(row, filters.value));
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

  return {
    isMobile,
    sortSelectStyle,
    scanPathDialogWidth,
    expandedModPaths,
    modList,
    filteredList,
    scanning,
    copyingBikey,
    bikeySummary,
    copyMissingEnabled,
    autoCopyBikey,
    dlcMods,
    sortMode,
    filters,
    statusFilterChips,
    applyQuickFilter,
    isQuickFilterActive,
    signatureCounts,
    selectedKeyRows,
    selectVisibleKeys,
    clearKeySelection,
    deploySelectedKeys,
    copyFilteredList,
    exportFilteredCsv,
    canDeployModKeys,
    modSignatureRisk,
    showScanPathDialog,
    scanPaths,
    savingScanPaths,
    showDownloadConfirm,
    pendingDownloadIds,
    showHtmlEnable,
    htmlEnableEntries,
    htmlFileInput,
    showBikeyList,
    bikeyKeysDir,
    bikeyListFiles,
    steamCmdReady,
    checkingUpdates,
    autoCheckUpdates,
    modRowKey,
    toggleModPath,
    updateStatusLabel,
    updateStatusTagType,
    loadMods,
    saveDlc,
    doScan,
    onRoleChange,
    disableMods,
    copyBikeys,
    saveAutoCopyBikey,
    fetchWorkshopDetails,
    checkModUpdates,
    onDownloadConfirm,
    downloadSelectedMods,
    downloadOutdatedMods,
    onGetMods,
    onHtmlFileSelected,
    isModInstalled,
    applyHtmlEnable,
    downloadMissingFromHtml,
    openScanPathDialog,
    addScanPathRow,
    removeScanPathRow,
    saveScanPaths,
    onBikeyMenu,
  };
}
