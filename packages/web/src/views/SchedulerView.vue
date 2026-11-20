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
import { createClient, type CronJobEntry, type MaintenancePolicy } from "@a3st/api-client";
import { resolveTaskMessage } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const cfg = ref<Record<string, unknown>>({});
const cronRows = ref<CronJobEntry[]>([]);
const loading = ref(false);
const syncing = ref(false);
const selectedRows = ref<CronJobEntry[]>([]);
let trackDirty = false;
let migrationPending = false;
let loadGeneration = 0;
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
function getClientForScope() {
  const conn = store.connections.find((item) => item.id === props.connectionId);
  return conn ? createClient(conn.baseUrl, conn.token) : null;
}
async function migrateLegacy() {
  if (!maintenance.value.enabled || (maintenance.value.template !== "check_only" && !maintenance.value.windowConfirmed)) {
    ElMessage.warning("先选择并启用新策略，核对实际时区和窗口，再确认迁移"); return;
  }
  const uuid = props.serverUuid; const connection = props.connectionId;
  const targets = legacyUpdates.value.map((row) => row.taskId);
  const summary = legacyUpdates.value.map((row) => `${row.taskId}：${row.cron}；旧禁更 ${row.quietHoursStart || '无'}—${row.quietHoursEnd || '无'}`).join("\n");
  const targetSummary = JSON.stringify({ template: maintenance.value.template, timeZone: maintenance.value.timeZone, windows: maintenance.value.windows, protectedWindows: maintenance.value.protectedWindows });
  try {
    await ElMessageBox.confirm(`将停用以下旧更新任务（非更新任务不变）：\n${summary}\n新规则：${targetSummary}\n复杂 Cron 不自动猜测为时间窗口，请核对上方新规则已涵盖原维护与保护需求。确认后仍需保存；保存会同步停用旧任务。`, "旧更新 Cron 迁移预览", { confirmButtonText: "确认迁移并待保存", cancelButtonText: "保留原任务", type: "warning" });
    if (uuid !== props.serverUuid || connection !== props.connectionId) return;
    for (const row of cronRows.value) if (targets.includes(row.taskId) && row.actionText === "update_mods") row.enabled = false;
    migrationPending = true; markDirty();
  } catch { /* 取消不改变旧任务。 */ }
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
  migrationPending = false;
  try {
    const client = getClientForScope();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (generation !== loadGeneration) return;
    if (res.success) {
      cfg.value = applyDefaults(res.data as Record<string, unknown>);
      maintenance.value = coercePolicy(res.data.maintenance);
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

async function save() {
  const client = getClientForScope();
  if (!client) {
    throw new Error("未连接");
  }
  if (maintenance.value.enabled && legacyUpdates.value.length) throw new Error("仍有启用的旧更新 Cron，请先预览迁移或显式停用，避免双重调度");
  const uuid = props.serverUuid;
  const syncMigration = migrationPending;
  const sched = scheduler();
  sched.cronJobs = buildCronJobsMap();
  const res = await client.patchConfig(uuid, { scheduler: sched, maintenance: maintenance.value } as never);
  if (!res.success) {
    throw new Error(res.error ?? "保存失败");
  }
  if (syncMigration) {
    const synced = await client.submitTask({ serverUuid: uuid, commands: [{ action: "sync_cron_jobs" }] });
    if (!synced.success) throw new Error("迁移配置已保存，但旧任务停用同步失败，请立即重试「保存并同步到调度器」");
    if (uuid === props.serverUuid) migrationPending = false;
  }
  ElMessage.success("定时及维护设置已保存");
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

function addCronRow() {
  cronRows.value.push({
    taskId: `task_${cronRows.value.length + 1}`,
    cron: "0 4 * * *",
    actionText: "restart",
    remark: "",
    enabled: true,
    quietHoursStart: "",
    quietHoursEnd: "",
  });
}

function removeSelected(rows: CronJobEntry[]) {
  if (!rows.length) {
    return;
  }
  const ids = new Set(rows.map((r) => r.taskId));
  cronRows.value = cronRows.value.filter((r) => !ids.has(r.taskId));
}

async function syncCron() {
  syncing.value = true;
  try {
    const client = getClientForScope();
    if (!client) {
      return;
    }
    await save();
    markClean();
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: "sync_cron_jobs" as const }],
    });
    const msg = resolveTaskMessage(res.data as never, "定时任务已同步");
    ElMessage.success(msg);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "同步失败");
  } finally {
    syncing.value = false;
  }
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
      <el-button size="small" :loading="syncing" @click="syncCron">保存并同步到调度器</el-button>
      <el-button size="small" @click="addCronRow">添加任务</el-button>
      <el-button size="small" :disabled="!selectedRows.length" @click="removeSelected(selectedRows)">删除选中</el-button>
      <span class="hint-inline">修改后先点顶栏「保存」，或使用「保存并同步到调度器」</span>
    </template>
    <SettingsViewLayout kicker="DEPLOY / 02 · CRON" title="定时任务与维护">
      <MaintenancePolicyEditor v-model="maintenance" />
      <ArkTechPanel v-if="legacyUpdates.length" title="旧更新计划迁移" code="OPS-MIGRATE">
        <p class="hint">发现 {{ legacyUpdates.length }} 个启用的旧更新 Cron。不会自动改写；确认迁移后保存会停用这些旧更新任务并同步调度器。请先核对新策略的时区、维护和活动保护时段。</p>
        <el-button @click="migrateLegacy">预览旧更新 Cron 迁移</el-button>
      </ArkTechPanel>
      <MaintenancePreviewPanel :connection-id="connectionId" :server-uuid="serverUuid" />
      <ArkTechPanel title="内置计划" code="CRON-01">
        <div class="form-row">
          <label>重启计划</label>
          <el-input v-model="scheduler().restartCron" size="small" placeholder="0 4 * * *" />
        </div>
        <div class="form-row">
          <label>监控采集</label>
          <el-input v-model="scheduler().monitoringCron" size="small" placeholder="*/5 * * * *" />
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
          <el-table-column label="任务 ID" width="120">
            <template #default="{ row }">
              <el-input v-model="row.taskId" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="Cron" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.cron" size="small" />
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
          Cron：分 时 日 月 周。「检查/更新模组」仅针对本服已启用模组；有更新且不在禁更窗时会先停止全部服务器再下载并重启先前在跑的服。
        </p>
      </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.hint-inline { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 8px; }
.form-row label { width: 120px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px; }
</style>
