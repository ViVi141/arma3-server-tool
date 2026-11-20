<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import MaintenancePolicyEditor from "@/components/console/MaintenancePolicyEditor.vue";
import MaintenancePreviewPanel from "@/components/console/MaintenancePreviewPanel.vue";
import { ref, onMounted, watch, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigEditorRegistration } from "@/composables/configEditor";
import { applyDefaults } from "@/utils/defaults";
import { cronStatus } from "@/utils/cron";
import { createClient, type CronJobEntry, type MaintenancePolicy } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const cfg = ref<Record<string, unknown>>({});
const cronRows = ref<CronJobEntry[]>([]);
const loading = ref(false);
const syncing = ref(false);
const selectedRows = ref<CronJobEntry[]>([]);
/** 升级兼容：旧配置被逐字段补全后，必须让用户知道系统做了什么。 */
const repairNotes = ref<string[]>([]);
/** 迁移已确认但还没保存：面板改为完成态，避免“点了没反应”的错觉。 */
const migrationPending = ref(false);
const migrationOpen = ref(false);
const policyAnchor = ref<HTMLElement | null>(null);
const policyFlash = ref(false);
const originalTaskIds = ref<Set<string>>(new Set());
let migrationScope = { uuid: "", connection: "" };
let trackDirty = false;
let loadGeneration = 0;

const TEMPLATE_LABELS: Record<MaintenancePolicy["template"], string> = {
  check_only: "仅检查：不停止、不下载",
  maintenance_window: "固定维护窗口：连续无人 10 分钟",
  idle_first: "常驻服：空闲优先，超过 24 小时等待授权窗口",
};
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const STANDARD_ACTIONS = new Set(["restart", "stop", "start", "detect", "update_mods"]);

function defaultPolicy(): MaintenancePolicy {
  return { enabled: false, template: "check_only", timeZone: "UTC", windows: [{ days: [0,1,2,3,4,5,6], start: "04:00", end: "05:00" }], protectedWindows: [], windowConfirmed: false, allowOccupied: false, occupiedConfirmed: false, expectedDurationMinutes: 60 };
}
const maintenance = ref<MaintenancePolicy>(defaultPolicy());
const legacyUpdates = computed(() => cronRows.value.filter((job) => job.actionText === "update_mods" && job.enabled));
/**
 * 旧版本（升级前）任务的动作可能只有 action 数字或中文文案；按后端
 * resolveCronAction 的同一规则归一化，展示与调度语义才一致。
 */
function normalizeAction(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "update_mods" || text.includes("update_mods") || text.includes("更新模组") || text.includes("检查模组")) return "update_mods";
  if (text === "1" || text.includes("start") || text.includes("启动")) return "start";
  if (text === "2" || text.includes("stop") || text.includes("停止")) return "stop";
  if (text === "3" || text.includes("detect") || text.includes("检测")) return "detect";
  return "restart";
}
type PolicyWindow = MaintenancePolicy["windows"][number];
function coerceWindows(value: unknown): PolicyWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PolicyWindow =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
      && Array.isArray((item as PolicyWindow).days)
      && typeof (item as PolicyWindow).start === "string"
      && typeof (item as PolicyWindow).end === "string");
}
/**
 * 旧版本升级后的维护配置可能只存在部分字段（或结构不完整）；逐个字段回退默认值，
 * 避免编辑器读到非数组的 windows/protectedWindows 而整页渲染失败。
 */
function coercePolicy(value: unknown): MaintenancePolicy {
  const fallback = defaultPolicy();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const data = value as Record<string, unknown>;
  const windows = coerceWindows(data.windows);
  const minutes = Number(data.expectedDurationMinutes);
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : fallback.enabled,
    template: data.template === "maintenance_window" || data.template === "idle_first" || data.template === "check_only" ? data.template : fallback.template,
    timeZone: typeof data.timeZone === "string" && data.timeZone.trim() ? data.timeZone.trim() : fallback.timeZone,
    windows: windows.length ? windows : fallback.windows,
    protectedWindows: coerceWindows(data.protectedWindows),
    windowConfirmed: typeof data.windowConfirmed === "boolean" ? data.windowConfirmed : false,
    allowOccupied: typeof data.allowOccupied === "boolean" ? data.allowOccupied : false,
    occupiedConfirmed: typeof data.occupiedConfirmed === "boolean" ? data.occupiedConfirmed : false,
    expectedDurationMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : fallback.expectedDurationMinutes,
  };
}
/** 对比旧配置与默认回退，列出被系统补全/纠正的字段。 */
function inspectMaintenance(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const data = raw as Record<string, unknown>;
  const notes: string[] = [];
  if (!Array.isArray(data.windows) || !data.windows.length) notes.push("缺少维护窗口");
  else if (coerceWindows(data.windows).length !== data.windows.length) notes.push("维护窗口含无效条目");
  if (!Array.isArray(data.protectedWindows)) notes.push("缺少活动保护时段字段");
  if (data.enabled !== undefined && typeof data.enabled !== "boolean") notes.push("启用状态类型异常");
  if (data.template !== undefined && !(data.template === "maintenance_window" || data.template === "idle_first" || data.template === "check_only")) notes.push("策略模板无效");
  if (data.timeZone !== undefined && !(typeof data.timeZone === "string" && data.timeZone.trim())) notes.push("时区为空");
  if (data.expectedDurationMinutes !== undefined) {
    const minutes = Number(data.expectedDurationMinutes);
    if (!(Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440)) notes.push("停服预算超出 1–1440 分钟");
  }
  return notes;
}
function inspectJobs(jobs: Record<string, CronJobEntry>): string[] {
  let legacyActions = 0;
  for (const job of Object.values(jobs)) {
    if (!job || typeof job !== "object") continue;
    const raw = job.actionText ?? job.action;
    if (raw !== undefined && !STANDARD_ACTIONS.has(String(raw))) legacyActions += 1;
  }
  return legacyActions ? [`${legacyActions} 个任务的旧格式动作已归一化`] : [];
}
function getClientForScope() {
  const conn = store.connections.find((item) => item.id === props.connectionId);
  return conn ? createClient(conn.baseUrl, conn.token) : null;
}
function weekdayText(days: number[]): string {
  if (days.length === 7) return "每天";
  return days.map((day) => WEEKDAYS[day] ?? String(day)).join("、");
}
function windowText(window: PolicyWindow): string {
  return `${weekdayText(window.days)} ${window.start}–${window.end}`;
}
const policySummary = computed(() => {
  const policy = maintenance.value;
  const windows = Array.isArray(policy.windows) ? policy.windows : [];
  const protectedWindows = Array.isArray(policy.protectedWindows) ? policy.protectedWindows : [];
  const maintenanceText = windows.length ? windows.map(windowText).join("；") : "未设置";
  const protectedText = protectedWindows.length ? protectedWindows.map(windowText).join("；") : "无";
  return `模板「${TEMPLATE_LABELS[policy.template]}」；时区 ${policy.timeZone}；维护窗口 ${maintenanceText}；活动保护 ${protectedText}。`;
});
const migrationRows = computed(() => legacyUpdates.value.map((row) => ({
  taskId: row.taskId,
  cron: row.cron,
  quiet: `${row.quietHoursStart || "无"} — ${row.quietHoursEnd || "无"}`,
})));
/** 迁移前置条件逐项检查，缺什么就说清楚去了哪里补。 */
function missingMigrationPrerequisites(): string[] {
  const missing: string[] = [];
  if (!maintenance.value.enabled) missing.push("勾选「启用本服维护策略」");
  if (maintenance.value.template === "check_only") missing.push("选择「固定维护窗口」或「常驻服」模板");
  if (!maintenance.value.windowConfirmed) missing.push("勾选「已核对星期、实际时区及窗口」");
  return missing;
}
function focusPolicyPanel() {
  policyAnchor.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  policyFlash.value = true;
  window.setTimeout(() => { policyFlash.value = false; }, 1600);
}
function migrateLegacy() {
  const missing = missingMigrationPrerequisites();
  if (missing.length) {
    ElMessage.warning(`迁移前请先在「逐服维护策略」完成：${missing.join("；")}`);
    focusPolicyPanel();
    return;
  }
  migrationScope = { uuid: props.serverUuid, connection: props.connectionId };
  migrationOpen.value = true;
}
function confirmMigration() {
  migrationOpen.value = false;
  if (migrationScope.uuid !== props.serverUuid || migrationScope.connection !== props.connectionId) return;
  const targets = new Set(legacyUpdates.value.map((row) => row.taskId));
  for (const row of cronRows.value) {
    if (targets.has(row.taskId) && row.actionText === "update_mods") row.enabled = false;
  }
  migrationPending.value = true;
  markDirty();
}

const ACTION_OPTIONS = [
  { value: "restart", label: "重启服务器" },
  { value: "stop", label: "停止服务器" },
  { value: "start", label: "启动服务器" },
  { value: "detect", label: "检测并重启" },
  { value: "update_mods", label: "检查/更新模组" },
];

function scheduler(): Record<string, unknown> {
  return (cfg.value.scheduler ?? {}) as Record<string, unknown>;
}

async function load() {
  const generation = ++loadGeneration;
  loading.value = true;
  trackDirty = false;
  migrationPending.value = false;
  try {
    const client = getClientForScope();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (generation !== loadGeneration) return;
    if (res.success) {
      cfg.value = applyDefaults(res.data as Record<string, unknown>);
      const rawMaintenance = (res.data as Record<string, unknown>).maintenance;
      maintenance.value = coercePolicy(rawMaintenance);
      const jobs = (scheduler().cronJobs ?? {}) as Record<string, CronJobEntry>;
      cronRows.value = Object.entries(jobs)
        .filter((entry): entry is [string, CronJobEntry] => Boolean(entry[1]) && typeof entry[1] === "object")
        .map(([key, job]) => ({
          taskId: job.taskId ?? key,
          cron: job.cron ?? "",
          actionText: normalizeAction(job.actionText ?? job.action),
          remark: job.remark ?? "",
          enabled: job.enabled ?? job.status === 1,
          quietHoursStart: job.quietHoursStart ?? "",
          quietHoursEnd: job.quietHoursEnd ?? "",
        }));
      originalTaskIds.value = new Set(cronRows.value.map((row) => row.taskId));
      repairNotes.value = [...inspectMaintenance(rawMaintenance), ...inspectJobs(jobs)];
    }
  } finally {
    if (generation === loadGeneration) { loading.value = false; trackDirty = true; }
  }
}

function buildCronJobsMap(): Record<string, CronJobEntry> {
  const map: Record<string, CronJobEntry> = {};
  for (const row of cronRows.value) {
    const taskId = row.taskId.trim() || `task_${Date.now()}`;
    map[taskId] = {
      taskId,
      cron: row.cron,
      actionText: row.actionText,
      remark: row.remark,
      enabled: row.enabled,
      status: row.enabled ? 1 : 0,
      quietHoursStart: row.quietHoursStart?.trim() || undefined,
      quietHoursEnd: row.quietHoursEnd?.trim() || undefined,
    };
  }
  return map;
}

/** 保存前拦截后端会在同步时跳过的表达式，避免“保存成功但任务没生效”。 */
function invalidCronTargets(): string[] {
  const invalid: string[] = [];
  for (const row of cronRows.value) {
    const expr = String(row.cron ?? "").trim();
    if (expr && !cronStatus(expr).valid) invalid.push(`任务「${row.taskId.trim() || "未命名"}」`);
  }
  const scheduled: [string, unknown][] = [["重启计划", scheduler().restartCron], ["监控采集", scheduler().monitoringCron]];
  for (const [label, expr] of scheduled) {
    if (typeof expr === "string" && expr.trim() && !cronStatus(expr).valid) invalid.push(`「${label}」`);
  }
  return invalid;
}

/**
 * 保存即同步：只写配置不推调度器会让用户误以为已生效。
 * 同步失败时配置已落库，抛出的错误必须说清“已保存、未同步”。
 */
async function save() {
  const client = getClientForScope();
  if (!client) {
    throw new Error("未连接");
  }
  const invalid = invalidCronTargets();
  if (invalid.length) throw new Error(`Cron 表达式无效：${invalid.join("、")}。请按「分 时 日 月 周」修正后再保存`);
  if (maintenance.value.enabled && legacyUpdates.value.length) throw new Error("仍有启用的旧更新 Cron，请先预览迁移或显式停用，避免双重调度");
  const uuid = props.serverUuid;
  const sched = scheduler();
  sched.cronJobs = buildCronJobsMap();
  const res = await client.patchConfig(uuid, { scheduler: sched, maintenance: maintenance.value } as never);
  if (!res.success) {
    throw new Error(res.error ?? "保存失败");
  }
  const synced = await client.submitTask({ serverUuid: uuid, commands: [{ action: "sync_cron_jobs" }] });
  if (!synced.success) throw new Error("配置已保存，但同步调度器失败，请重试「保存并同步到调度器」");
  if (uuid === props.serverUuid) {
    migrationPending.value = false;
    repairNotes.value = [];
  }
  ElMessage.success("已保存并同步到调度器");
}

const { markDirty, markClean } = useConfigEditorRegistration(() => props.serverUuid, {
  label: "定时",
  save,
  reload: load,
});

watch(
  () => [props.connectionId, props.serverUuid],
  () => {
    load().then(() => {
      markClean();
    });
  }
);

watch(
  [cfg, cronRows, maintenance],
  () => {
    if (trackDirty) {
      markDirty();
    }
  },
  { deep: true }
);

function nextTaskId(): string {
  const used = new Set(cronRows.value.map((row) => row.taskId.trim()));
  let index = cronRows.value.length + 1;
  while (used.has(`task_${index}`)) index += 1;
  return `task_${index}`;
}

function addCronRow() {
  cronRows.value.push({
    taskId: nextTaskId(),
    cron: "0 4 * * *",
    actionText: "restart",
    remark: "",
    enabled: true,
    quietHoursStart: "",
    quietHoursEnd: "",
  });
}

async function removeSelected(rows: CronJobEntry[]) {
  if (!rows.length) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `从列表移除 ${rows.length} 个任务？保存后才会删除调度器任务；未保存时刷新页面即可恢复。`,
      "移除任务",
      { type: "warning", confirmButtonText: "移除", cancelButtonText: "保留" }
    );
  } catch { return; }
  const ids = new Set(rows.map((r) => r.taskId));
  cronRows.value = cronRows.value.filter((r) => !ids.has(r.taskId));
}

async function syncCron() {
  if (syncing.value) return;
  syncing.value = true;
  try {
    await save();
    markClean();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    syncing.value = false;
  }
}

/** 任务 ID 是调度器标识：改名在保存后等同删除旧任务并新建。 */
function isNewTaskId(taskId: string): boolean {
  return !originalTaskIds.value.has(taskId.trim());
}

onMounted(() => {
  load().then(() => {
    markClean();
  });
});
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <template #toolbar>
      <el-button size="small" type="primary" :loading="syncing" @click="syncCron">保存并同步到调度器</el-button>
      <el-button size="small" @click="addCronRow">添加任务</el-button>
      <el-button size="small" :disabled="!selectedRows.length" @click="removeSelected(selectedRows)">删除选中</el-button>
      <span class="hint-inline">保存即写入配置并同步调度器，顶栏「保存」与本按钮等效</span>
    </template>
    <SettingsViewLayout kicker="DEPLOY / 02 · CRON" title="定时任务与维护">
      <el-alert
        v-if="repairNotes.length"
        class="repair-alert"
        type="warning"
        show-icon
        title="检测到旧版本配置，已按默认值补全"
        :description="`${repairNotes.join('；')}。保存后将写入新格式；若旧策略另有约定，请先核对再保存。`"
        @close="repairNotes = []"
      />
      <div ref="policyAnchor" :class="{ 'policy-flash': policyFlash }">
        <MaintenancePolicyEditor v-model="maintenance" />
      </div>
      <ArkTechPanel v-if="legacyUpdates.length || migrationPending" title="旧更新计划迁移" code="OPS-MIGRATE">
        <el-alert
          v-if="migrationPending"
          type="success"
          show-icon
          :closable="false"
          title="已标记旧更新任务待停用"
          description="对应任务已取消勾选，保存后写入配置并同步调度器；非更新任务保持不变。"
        />
        <template v-else>
          <p class="hint">发现 {{ legacyUpdates.length }} 个启用的旧更新 Cron。不会自动改写；确认迁移后保存会停用这些旧更新任务并同步调度器。请先核对新策略的时区、维护和活动保护时段。</p>
          <el-button @click="migrateLegacy">预览旧更新 Cron 迁移</el-button>
        </template>
      </ArkTechPanel>
      <MaintenancePreviewPanel :connection-id="connectionId" :server-uuid="serverUuid" />
      <ArkTechPanel title="内置计划" code="CRON-01">
        <div class="form-row">
          <label>重启计划</label>
          <div class="cron-field">
            <el-input v-model="scheduler().restartCron" size="small" placeholder="0 4 * * *" />
            <p class="field-hint" :class="{ 'field-hint--error': !cronStatus(String(scheduler().restartCron ?? '')).valid }">{{ cronStatus(String(scheduler().restartCron ?? '')).text }}</p>
          </div>
        </div>
        <div class="form-row">
          <label>监控采集</label>
          <div class="cron-field">
            <el-input v-model="scheduler().monitoringCron" size="small" placeholder="*/5 * * * *" />
            <p class="field-hint" :class="{ 'field-hint--error': !cronStatus(String(scheduler().monitoringCron ?? '')).valid }">{{ cronStatus(String(scheduler().monitoringCron ?? '')).text }}</p>
          </div>
        </div>
      </ArkTechPanel>

      <ArkTechPanel title="自定义 Cron 任务" code="CRON-02">
        <el-table
          :data="cronRows"
          stripe
          size="small"
          @selection-change="(rows: CronJobEntry[]) => { selectedRows = rows; }"
        >
          <el-table-column type="selection" width="40" />
          <el-table-column label="任务 ID" width="140">
            <template #default="{ row }">
              <el-input v-model="row.taskId" size="small" />
              <p v-if="isNewTaskId(row.taskId)" class="task-id-hint">保存后按新任务创建</p>
            </template>
          </el-table-column>
          <el-table-column label="Cron" min-width="170">
            <template #default="{ row }">
              <el-input v-model="row.cron" size="small" :class="{ 'cron-invalid': !cronStatus(row.cron).valid }" />
              <p class="field-hint" :class="{ 'field-hint--error': !cronStatus(row.cron).valid }">{{ cronStatus(row.cron).text }}</p>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }">
              <el-select v-model="row.actionText" size="small">
                <el-option v-for="opt in ACTION_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="禁更起" width="90">
            <template #default="{ row }">
              <el-input
                v-model="row.quietHoursStart"
                size="small"
                placeholder="18:00"
                :disabled="row.actionText !== 'update_mods'"
              />
            </template>
          </el-table-column>
          <el-table-column label="禁更止" width="90">
            <template #default="{ row }">
              <el-input
                v-model="row.quietHoursEnd"
                size="small"
                placeholder="22:00"
                :disabled="row.actionText !== 'update_mods'"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="100">
            <template #default="{ row }">
              <el-input v-model="row.remark" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="启用" width="70">
            <template #default="{ row }">
              <el-checkbox v-model="row.enabled" size="small" />
            </template>
          </el-table-column>
        </el-table>
        <p class="hint">
          Cron：分 时 日 月 周，保存前会校验。「检查/更新模组」仅针对本服已启用模组；有更新且不在禁更窗时会先停止全部服务器再下载并重启先前在跑的服。
        </p>
        <p class="hint">
          任务 ID 是调度器标识：保存后改名等同删除旧任务并新建；「下次运行」按本机时区预览，实际执行以开服机时区为准。
        </p>
      </ArkTechPanel>
    </SettingsViewLayout>

    <el-dialog v-model="migrationOpen" title="旧更新 Cron 迁移预览" width="680px">
      <p class="hint">保存后将停用以下旧更新任务（非更新任务不变），并同步调度器。复杂 Cron 不会自动换算为时间窗口，请确认新策略已覆盖原来的维护与禁更需求。</p>
      <el-table :data="migrationRows" size="small" class="migration-table">
        <el-table-column prop="taskId" label="任务 ID" width="130" />
        <el-table-column prop="cron" label="Cron" width="110" />
        <el-table-column prop="quiet" label="原禁更窗" width="130" />
      </el-table>
      <p class="hint">将启用的新策略：{{ policySummary }}</p>
      <template #footer>
        <el-button @click="migrationOpen = false">保留原任务</el-button>
        <el-button type="primary" @click="confirmMigration">停用这些旧任务（保存后生效）</el-button>
      </template>
    </el-dialog>
  </ConsolePageLayout>
</template>

<style scoped>
.hint-inline { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 8px; }
.form-row { display: flex; align-items: flex-start; gap: 12px; margin: 8px 0; }
.form-row label { width: 120px; flex-shrink: 0; font-size: 12px; line-height: 24px; }
.form-row .cron-field { flex: 1; max-width: 560px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px; line-height: 1.7; }
.field-hint { font-size: 11px; line-height: 1.4; margin: 4px 0 0; color: var(--el-text-color-secondary); }
.field-hint--error { color: var(--el-color-danger); }
.task-id-hint { font-size: 11px; line-height: 1.4; margin: 4px 0 0; color: var(--el-color-warning); }
.cron-invalid :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset; }
.repair-alert { margin-bottom: 12px; }
.migration-table { margin: 8px 0; }
.policy-flash { animation: policy-flash 1.6s ease; border-radius: 4px; }
@keyframes policy-flash {
  0%, 100% { box-shadow: none; }
  25%, 75% { box-shadow: 0 0 0 3px var(--el-color-warning); }
}
</style>
