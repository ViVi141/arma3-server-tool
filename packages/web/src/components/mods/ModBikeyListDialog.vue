<script setup lang="ts">
import { isElectron, openPath } from "@/utils/electron";

const props = defineProps<{
  visible: boolean;
  keysDir: string;
  files: { name: string; fullPath: string }[];
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
}>();

function close() {
  emit("update:visible", false);
}

async function openFolder() {
  if (!props.keysDir) {
    return;
  }
  if (isElectron()) {
    await openPath(props.keysDir);
    return;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="服务器 Bikey 列表"
    width="720px"
    @update:model-value="emit('update:visible', $event)"
  >
    <p class="hint">Keys 目录: {{ keysDir || "—" }}</p>
    <el-table :data="files" stripe size="small" max-height="360">
      <el-table-column prop="name" label="文件名" width="40%" />
      <el-table-column prop="fullPath" label="完整路径" min-width="60%" show-overflow-tooltip />
    </el-table>
    <template #footer>
      <el-button @click="openFolder">打开 Keys 目录</el-button>
      <el-button type="primary" @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}
</style>
