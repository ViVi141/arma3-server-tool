<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onUnmounted, nextTick, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigEditorRegistration } from "@/composables/configEditor";
import type { MissionEntry, HealthConfigSection } from "@a3st/api-client";
import UploadView from "./UploadView.vue";
import { resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const DIFFICULTY_OPTIONS = [
  { value: 0, label: "新兵" },
  { value: 1, label: "常规" },
  { value: 2, label: "老兵" },
  { value: 3, label: "自定义" },
];

const FORCED_OPTIONS = [
  { value: "none", label: "关闭" },
  { value: "Recruit", label: "新兵" },
  { value: "Regular", label: "常规" },
  { value: "Veteran", label: "老兵" },
  { value: "Custom", label: "自定义" },
];

interface MissionRow extends MissionEntry {
  template: string;
}

const missions = ref<MissionRow[]>([]);
const forcedDifficulty = ref("none");
const autoSelectMission = ref(false);
const randomMissionOrder = ref(false);
const missionParamsText = ref("");
const loading = ref(false);
const switching = ref(false);
const saving = ref(false);
const errorMsg = ref("");
let trackDirty = false;
let loadGeneration = 0;
let disposed = false;
const contextKey = () => `${props.connectionId}:${props.serverUuid}`;
onUnmounted(() => { disposed = true; loadGeneration++; });

const scanning = ref(false);
const healthConfig = ref<HealthConfigSection>({ enabled: false, unattended: false, startupTimeoutSeconds: 600 });
const unattendedTemplate = ref("");
const applyUnattendedBundle = ref(false);

async function prepareUnattended() {
  const template = unattendedTemplate.value;
  const mission = missions.value.find((m) => m.template === template);
  if (!mission) { ElMessage.warning("请先上传或扫描任务并指定启动模板"); return; }
  const context = `${props.connectionId}:${props.serverUuid}`;
  try {
    await ElMessageBox.confirm(
      `实例：${props.serverUuid}\n启动任务：${template}\n将开启 autoInit、persistent、独立健康心跳，关闭 noLogs 并保留 RPT。\n本操作仅修改待保存配置；请通过“应用更改”写入，是否重启仍由你确认。不会修改旧监控，也不会要求 filePatching。`,
      "确认无人自动运行配置", { confirmButtonText: "加入待应用更改", cancelButtonText: "取消", customStyle: { whiteSpace: "pre-line" } }
    );
  } catch { return; }
  if (disposed || context !== contextKey()) return;
  const selected = missions.value.find((m) => m.template === template);
  if (!selected) { ElMessage.warning("任务列表已改变，请重新选择启动模板"); return; }
  missions.value = [selected, ...missions.value.filter((m) => m.template !== template)];
  healthConfig.value = { ...healthConfig.value, enabled: true, unattended: true };
  applyUnattendedBundle.value = true;
  markDirty();
  ElMessage.success("无人运行组合已加入待应用更改，尚未重启服务器");
}

async function scanMissionsFromDisk() {
  scanning.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.scanMissions(props.serverUuid);
    if (!res.success) {
      throw new Error(res.error ?? "扫描失败");
    }
    const scanned = res.data.scanned ?? 0;
    const list = res.data.missions ?? [];
    missions.value = list.map((m) => ({
      template: m.template,
      difficulty: m.difficulty ?? 3,
      whiteList: m.whiteList ?? false,
      choose: m.choose ?? false,
    }));
    markDirty();
    ElMessage.success(`已扫描 ${scanned} 个任务，列表已更新（需保存后写入配置）`);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "扫描失败");
  } finally {
    scanning.value = false;
  }
}

async function loadConfig() {
  const current = ++loadGeneration;
  const context = contextKey();
  loading.value = true;
  errorMsg.value = "";
  trackDirty = false;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (disposed || current !== loadGeneration || context !== contextKey()) return;
    if (!res.success) throw new Error(res.error ?? "配置加载失败");
    const data = res.data as Record<string, unknown>;
    healthConfig.value = { enabled: false, unattended: false, startupTimeoutSeconds: 600, ...(res.data.health ?? {}) };
    applyUnattendedBundle.value = false;
    const tasks = (data.tasks ?? {}) as Record<string, unknown>;
    const basic = (data.basic ?? {}) as Record<string, unknown>;
    const missionParams = (data.missionParams ?? {}) as { params?: Record<string, string> };

    const list = (tasks.missions ?? data.missionList ?? []) as MissionEntry[];
    missions.value = list.map((m) => ({
      template: m.template,
      difficulty: m.difficulty ?? 3,
      whiteList: m.whiteList ?? false,
      choose: m.choose ?? false,
    }));

    unattendedTemplate.value = missions.value[0]?.template ?? "";
    forcedDifficulty.value = String(tasks.forcedDifficulty ?? basic.forcedDifficulty ?? "none");
    autoSelectMission.value = !!(tasks.autoSelectMission ?? basic.autoSelectMission);
    randomMissionOrder.value = !!(tasks.randomMissionOrder ?? basic.randomMissionOrder);

    const params = missionParams.params ?? {};
    const lines: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      lines.push(`${key}=${value}`);
    }
    missionParamsText.value = lines.join("\n");
  } catch (e: unknown) {
    if (!disposed && current === loadGeneration && context === contextKey()) errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    await nextTick();
    if (!disposed && current === loadGeneration && context === contextKey()) {
      loading.value = false;
      trackDirty = true;
      markCleanRef();
    }
  }
}

function parseMissionParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    params[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return params;
}

async function saveMissions() {
  const client = store.getClient();
  if (!client) {
    throw new Error("未连接");
  }
  const context = contextKey();
  const current = loadGeneration;
  saving.value = true;
  try {
    const res = await client.patchConfig(
      props.serverUuid,
      {
        health: healthConfig.value,
        ...(applyUnattendedBundle.value ? { startup: { autoInit: true } } : {}),
        tasks: {
          missions: missions.value,
          forcedDifficulty: forcedDifficulty.value,
          autoSelectMission: autoSelectMission.value,
          randomMissionOrder: randomMissionOrder.value,
        },
        basic: {
          ...(applyUnattendedBundle.value ? { persistent: true, noLogs: false } : {}),
          forcedDifficulty: forcedDifficulty.value,
          autoSelectMission: autoSelectMission.value,
          randomMissionOrder: randomMissionOrder.value,
        },
        missionParams: {
          params: parseMissionParams(missionParamsText.value),
        },
      } as never
    );
    if (disposed || context !== contextKey() || current !== loadGeneration) throw new Error("实例或配置已切换，请在当前实例重新应用更改");
    if (!res.success) {
      const detail = res.data as { message?: string } | null;
      throw new Error(detail?.message ?? res.error ?? "保存失败");
    }
    applyUnattendedBundle.value = false;
    markCleanRef();
    ElMessage.success("任务设置已保存");
  } finally {
    saving.value = false;
  }
}

let markCleanRef: () => void = () => {};

const { markDirty, markClean } = useConfigEditorRegistration(() => props.serverUuid, {
  label: "任务",
  save: saveMissions,
  reload: loadConfig,
});
markCleanRef = markClean;

watch(contextKey, () => { void loadConfig(); }, { immediate: true });

watch(
  [missions, forcedDifficulty, autoSelectMission, randomMissionOrder, missionParamsText, healthConfig],
  () => {
    if (trackDirty) {
      markDirty();
    }
  },
  { deep: true }
);

async function switchMission(template: string) {
  switching.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [
        { action: "switch_mission", missionTemplate: template },
      ],
    });
    const msg = resolveTaskMessage(res.data as never, `任务已切换至 ${template}`);
    if (taskSucceeded(res.data as never)) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  } finally {
    switching.value = false;
  }
}

function disableUnattended() {
  healthConfig.value.unattended = false;
  applyUnattendedBundle.value = false;
  markDirty();
}

async function savePage() {
  try { await saveMissions(); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存失败"); }
}
</script>

<template>
  <ConsolePageLayout>
    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon closable style="margin: 8px;" />

    <el-card v-loading="loading" style="margin: 8px;" data-testid="unattended-config">
      <template #header>无人自动运行与独立健康</template>
      <p>已有实例默认不改变配置。组合设置需确认后通过“应用更改”写入；不会在此处自动重启。</p>
      <div class="form-row">
        <label>启动任务模板</label>
        <el-select v-model="unattendedTemplate" aria-label="无人运行启动任务" placeholder="请先上传或扫描任务" style="min-width: 240px;">
          <el-option v-for="mission in missions" :key="mission.template" :value="mission.template" :label="mission.template" />
        </el-select>
        <el-button data-testid="prepare-unattended" @click="prepareUnattended">预览无人运行组合</el-button>
      </div>
      <p v-if="healthConfig.unattended">无人运行目标已开启；启动任务为列表第一项。缺少模板时服务端将拒绝完成设置。
        <el-button size="small" @click="disableUnattended">关闭无人运行目标</el-button>
      </p>
      <p>关闭目标仅停止该配置要求，不自动撤销 autoInit、persistent 或停止当前任务；心跳可单独关闭。</p>
      <div class="form-row"><el-checkbox v-model="healthConfig.enabled">启用独立任务心跳（仅服务端 @a3st_health）</el-checkbox></div>
      <div class="form-row">
        <label>启动等待（秒）</label>
        <el-input-number v-model="healthConfig.startupTimeoutSeconds" :min="120" :max="1800" :step="60" aria-label="健康启动等待秒数" />
      </div>
      <p>默认等待 10 分钟（可选 2—30 分钟）；每 15 秒心跳、10 秒采样，90 秒无心跳异常。RCon 未响应时人数未知，不能作为无人维护依据。</p>
    </el-card>

    <el-card v-loading="loading" style="margin: 8px;">
      <template #header>
        <div class="mission-header">
          <span>任务列表</span>
          <div class="mission-header__actions">
            <el-button size="small" type="primary" :loading="saving" data-testid="btn-page-save" @click="savePage">
              保存
            </el-button>
            <el-button size="small" :loading="scanning" @click="scanMissionsFromDisk">扫描 MPMissions</el-button>
          </div>
        </div>
      </template>
      <el-table v-if="missions.length" :data="missions" stripe size="small">
        <el-table-column prop="template" label="任务名称" min-width="180" />
        <el-table-column label="难度" width="120">
          <template #default="{ row }">
            <el-select v-model="row.difficulty" size="small">
              <el-option v-for="opt in DIFFICULTY_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="白名单" width="80">
          <template #default="{ row }">
            <el-checkbox v-model="row.whiteList" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="选用" width="70">
          <template #default="{ row }">
            <el-checkbox v-model="row.choose" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="primary" :loading="switching" @click="switchMission(row.template)">
              切换并重启
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无任务（上传 PBO 或扫描服务器 mpmissions 目录）" />
    </el-card>

    <el-card style="margin: 8px;">
      <template #header><span>任务选项</span></template>
      <div class="form-row">
        <label>强制任务难度</label>
        <el-select v-model="forcedDifficulty" size="small" style="width: 160px;">
          <el-option v-for="opt in FORCED_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
      <div class="form-row">
        <el-checkbox v-model="autoSelectMission">无人在线时自动切换下一任务</el-checkbox>
      </div>
      <div class="form-row">
        <el-checkbox v-model="randomMissionOrder">按随机顺序轮换任务列表</el-checkbox>
      </div>
      <div class="form-row block">
        <label>任务参数 (key=value，每行一条)</label>
        <el-input v-model="missionParamsText" type="textarea" :rows="4" />
      </div>
    </el-card>

    <UploadView :connection-id="connectionId" :server-uuid="serverUuid" style="margin: 8px;" />
  </ConsolePageLayout>
</template>

<style scoped>
.form-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.form-row :deep(.el-checkbox) { height: auto; white-space: normal; }
.form-row :deep(.el-checkbox__label) { white-space: normal; }
.form-row :deep(.el-select) { max-width: 100%; }
p { font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.mission-header { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.mission-header__actions { display: flex; gap: 6px; align-items: center; }
.form-row.block { flex-direction: column; align-items: stretch; }
.form-row label { width: 120px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.form-row.block label { width: auto; }
</style>
