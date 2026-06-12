<script setup lang="ts">
import { computed, ref, watch } from "vue";

export interface HtmlModEntry {
  modId: number;
  title: string;
  selected: boolean;
  installStatus: string;
}

const props = defineProps<{
  visible: boolean;
  entries: { id: number; name: string }[];
  isInstalled: (modId: number) => boolean;
  canDownload: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  confirm: [{ modIds: number[]; target: "client" | "server" | "hc" | "all" }];
  downloadMissing: [number[]];
}>();

const target = ref<"client" | "server" | "hc" | "all">("client");
const rows = ref<HtmlModEntry[]>([]);

watch(
  () => props.visible,
  (open) => {
    if (!open) {
      return;
    }
    target.value = "client";
    rows.value = props.entries.map((entry) => ({
      modId: entry.id,
      title: entry.name,
      selected: true,
      installStatus: props.isInstalled(entry.id) ? "已安装" : "未安装",
    }));
  }
);

const missingIds = computed(() =>
  rows.value.filter((row) => !props.isInstalled(row.modId)).map((row) => row.modId)
);

function close() {
  emit("update:visible", false);
}

function refreshStatus() {
  rows.value = rows.value.map((row) => ({
    ...row,
    installStatus: props.isInstalled(row.modId) ? "已安装" : "未安装",
  }));
}

function downloadMissing() {
  if (missingIds.value.length) {
    emit("downloadMissing", missingIds.value);
  }
}

function confirm() {
  const modIds = rows.value.filter((row) => row.selected).map((row) => row.modId);
  emit("confirm", { modIds, target: target.value });
  close();
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="从 HTML 启用模组"
    width="920px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <p class="hint">勾选要启用的模组，并选择应用到客户端 / 服务端 / 无头 / 全部。</p>
    <div class="target-row">
      <span>应用到:</span>
      <el-select v-model="target" size="small" style="width: 240px">
        <el-option value="client" label="客户端模组 (-mod)" />
        <el-option value="server" label="服务器模组 (-serverMod)" />
        <el-option value="hc" label="无头客户端 (HC -mod)" />
        <el-option value="all" label="全部 (客户端 + 服务端 + 无头)" />
      </el-select>
    </div>
    <div class="action-row">
      <el-button size="small" :disabled="!canDownload || !missingIds.length" @click="downloadMissing">
        下载未安装...
      </el-button>
      <el-button size="small" @click="refreshStatus">刷新状态</el-button>
    </div>
    <el-table :data="rows" stripe size="small" max-height="320">
      <el-table-column label="启用" width="70" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.selected" />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="模组名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="modId" label="Workshop ID" width="120" align="center" />
      <el-table-column prop="installStatus" label="本地状态" width="100" align="center" />
    </el-table>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirm">启用选中</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}
.target-row,
.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
</style>
