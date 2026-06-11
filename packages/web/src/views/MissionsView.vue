<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { ArmaServerConfig } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const config = ref<ArmaServerConfig | null>(null);
const missions = ref<string[]>([]);
const loading = ref(false);
const switching = ref(false);
const errorMsg = ref("");

async function loadConfig() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      config.value = res.data;
      const list = res.data.missionList ?? [];
      missions.value = list.map((m) => m.template);
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function switchMission(template: string) {
  switching.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [
        { action: "switch_mission", missionTemplate: template },
        { action: "write_cfg" },
        { action: "restart" },
      ],
    });
    const taskResult = res.data as { success: boolean; message: string; steps?: unknown[] };
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

onMounted(loadConfig);
</script>

<template>
  <div class="missions-page">
    <h2>任务管理</h2>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon closable style="margin: 12px 0;" />

    <el-card v-loading="loading" style="margin-top: 12px;">
      <template #header><span>任务列表</span></template>

      <el-table v-if="missions.length" :data="missions.map((t) => ({ template: t }))" stripe>
        <el-table-column prop="template" label="任务模板" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" type="primary" :loading="switching" @click="switchMission(row.template)">
              切换并重启
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无任务" />
    </el-card>
  </div>
</template>
