<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { useConfigEditorRegistration } from "@/composables/configEditor";
import type { MissionEntry } from "@a3st/api-client";
import UploadView from "./UploadView.vue";

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
const errorMsg = ref("");
let trackDirty = false;

const scanning = ref(false);

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
  loading.value = true;
  errorMsg.value = "";
  trackDirty = false;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (!res.success) {
      return;
    }
    const data = res.data as Record<string, unknown>;
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
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
    trackDirty = true;
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
  await client.patchConfig(
    props.serverUuid,
    {
      tasks: {
        missions: missions.value,
        forcedDifficulty: forcedDifficulty.value,
        autoSelectMission: autoSelectMission.value,
        randomMissionOrder: randomMissionOrder.value,
      },
      basic: {
        forcedDifficulty: forcedDifficulty.value,
        autoSelectMission: autoSelectMission.value,
        randomMissionOrder: randomMissionOrder.value,
      },
      missionParams: {
        params: parseMissionParams(missionParamsText.value),
      },
    } as never
  );
  ElMessage.success("任务设置已保存");
}

const { markDirty, markClean } = useConfigEditorRegistration(props.serverUuid, {
  label: "任务",
  save: saveMissions,
  reload: loadConfig,
});

watch(
  [missions, forcedDifficulty, autoSelectMission, randomMissionOrder, missionParamsText],
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
        { action: "write_cfg" },
        { action: "restart" },
      ],
    });
    const taskResult = res.data as { success: boolean; message: string };
    if (taskResult?.success) {
      ElMessage.success(`任务已切换至 ${template}`);
    } else {
      ElMessage.warning(taskResult?.message ?? "切换失败");
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
  } finally {
    switching.value = false;
  }
}

onMounted(() => {
  loadConfig().then(() => {
    markClean();
  });
});
</script>

<template>
  <ConsolePageLayout>
    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon closable style="margin: 8px;" />

    <el-card v-loading="loading" style="margin: 8px;">
      <template #header>
        <div class="mission-header">
          <span>任务列表</span>
          <el-button size="small" :loading="scanning" @click="scanMissionsFromDisk">扫描 MPMissions</el-button>
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
            <el-switch v-model="row.whiteList" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="选用" width="70">
          <template #default="{ row }">
            <el-switch v-model="row.choose" size="small" />
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
.form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.mission-header { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.form-row.block { flex-direction: column; align-items: stretch; }
.form-row label { width: 120px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.form-row.block label { width: auto; }
</style>
