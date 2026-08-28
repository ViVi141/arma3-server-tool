<script setup lang="ts">
import { ref, watch } from "vue";
import type { SteamWorkshopModInfo } from "@a3st/api-client";

const props = defineProps<{
  visible: boolean;
  modIds: number[];
  fetchDetails: (ids: number[]) => Promise<SteamWorkshopModInfo[]>;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  confirm: [number[]];
}>();

const loading = ref(false);
const rows = ref<SteamWorkshopModInfo[]>([]);
const statusText = ref("正在加载 Workshop 模组信息...");

function updateStatusLabel(status?: SteamWorkshopModInfo["updateStatus"]): string {
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

function sourceLabel(source?: SteamWorkshopModInfo["source"]): string {
  switch (source) {
    case "api":
      return "Steam API";
    case "html":
      return "Workshop 页面";
    default:
      return "回退";
  }
}

watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      return;
    }
    loading.value = true;
    statusText.value = "正在加载 Workshop 模组信息（API 不可用时将解析 Workshop 页面）...";
    try {
      rows.value = await props.fetchDetails(props.modIds);
      if (rows.value.length) {
        statusText.value = `共 ${rows.value.length} 个模组，请勾选需要下载的项。`;
      } else {
        statusText.value = "没有可下载的 Workshop 模组 ID。";
      }
    } catch {
      statusText.value = "加载失败，仍可勾选后尝试下载。";
      rows.value = props.modIds.map((id) => ({
        modId: id,
        title: `Workshop ${id}`,
        description: "",
        fileSizeMb: "-",
        selected: true,
        source: "fallback",
      }));
    } finally {
      loading.value = false;
    }
  }
);

function close() {
  emit("update:visible", false);
}

function confirm() {
  const selected = rows.value.filter((row) => row.selected).map((row) => row.modId);
  emit("confirm", selected);
  close();
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="确认需要更新/下载的模组"
    width="980px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <p class="status-text">{{ statusText }}</p>
    <el-table v-loading="loading" :data="rows" stripe size="small" max-height="360">
      <el-table-column label="确认下载" width="88" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.selected" />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="模组名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="modId" label="Workshop ID" width="120" align="center" />
      <el-table-column prop="fileSizeMb" label="大小" width="90" align="center" />
      <el-table-column label="远程更新" width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.timeUpdatedLabel ?? "-" }}</template>
      </el-table-column>
      <el-table-column label="本地更新" width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.localUpdatedLabel ?? "-" }}</template>
      </el-table-column>
      <el-table-column label="状态" width="88" align="center">
        <template #default="{ row }">
          <span>{{ updateStatusLabel(row.updateStatus) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100" align="center">
        <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
    </el-table>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="loading" @click="confirm">开始下载</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.status-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}
</style>
