<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import DeployOpsBar from "@/components/console/DeployOpsBar.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { ref, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigEditorRegistration } from "@/composables/configEditor";
import { applyDefaults } from "@/utils/defaults";
import type { CronJobEntry } from "@a3st/api-client";
import { resolveTaskMessage } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const cfg = ref<Record<string, unknown>>({});
const cronRows = ref<CronJobEntry[]>([]);
const loading = ref(false);
const syncing = ref(false);
const selectedRows = ref<CronJobEntry[]>([]);
let trackDirty = false;

const ACTION_OPTIONS = [
  { value: "restart", label: "重启服务器" },
  { value: "stop", label: "停止服务器" },
  { value: "start", label: "启动服务器" },
  { value: "detect", label: "检测并重启" },
];

function scheduler(): Record<string, unknown> {
  return (cfg.value.scheduler ?? {}) as Record<string, unknown>;
}

async function load() {
  loading.value = true;
  trackDirty = false;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      cfg.value = applyDefaults(res.data as Record<string, unknown>);
      const jobs = (scheduler().cronJobs ?? {}) as Record<string, CronJobEntry>;
      cronRows.value = Object.values(jobs).map((job) => ({
        taskId: job.taskId,
        cron: job.cron ?? "",
        actionText: job.actionText ?? "restart",
        remark: job.remark ?? "",
        enabled: job.enabled ?? job.status === 1,
      }));
    }
  } finally {
    loading.value = false;
    trackDirty = true;
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
    };
  }
  return map;
}

async function save() {
  const client = store.getClient();
  if (!client) {
    throw new Error("未连接");
  }
  const sched = scheduler();
  sched.cronJobs = buildCronJobsMap();
  await client.patchConfig(props.serverUuid, { scheduler: sched } as never);
  ElMessage.success("定时设置已保存");
}

const { markDirty, markClean } = useConfigEditorRegistration(props.serverUuid, {
  label: "定时",
  save,
  reload: load,
});

watch(
  [cfg, cronRows],
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
    const client = store.getClient();
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
  <ConsolePageLayout v-loading="loading">
    <DeployOpsBar />
    <template #toolbar>
      <el-button size="small" :loading="syncing" @click="syncCron">保存并同步到调度器</el-button>
      <el-button size="small" @click="addCronRow">添加任务</el-button>
      <el-button size="small" :disabled="!selectedRows.length" @click="removeSelected(selectedRows)">删除选中</el-button>
      <span class="hint-inline">修改后先点顶栏「保存」，或使用「保存并同步到调度器」</span>
    </template>
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
          <el-table-column label="操作" width="130">
            <template #default="{ row }">
              <el-select v-model="row.actionText" size="small">
                <el-option v-for="opt in ACTION_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="100">
            <template #default="{ row }">
              <el-input v-model="row.remark" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="启用" width="70">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" size="small" />
            </template>
          </el-table-column>
        </el-table>
        <p class="hint">Cron 表达式格式：分 时 日 月 周。</p>
      </ArkTechPanel>
  </ConsolePageLayout>
</template>

<style scoped>
.hint-inline { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 8px; }
.form-row label { width: 120px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px; }
</style>
