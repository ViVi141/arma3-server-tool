<script setup lang="ts">
import { ElMessage } from "element-plus";
import { isElectron, pickDirectory, pickFile } from "@/utils/electron";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    mode?: "directory" | "file";
    placeholder?: string;
    disabled?: boolean;
    fileFilters?: { name: string; extensions: string[] }[];
  }>(),
  {
    mode: "directory",
    placeholder: "",
    disabled: false,
    fileFilters: () => [],
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function onInput(value: string) {
  emit("update:modelValue", value);
}

async function browse() {
  if (!isElectron()) {
    ElMessage.info("路径浏览需在 Electron 桌面版中使用；浏览器模式下请手动输入路径");
    return;
  }

  let picked: string | null = null;
  if (props.mode === "file") {
    picked = await pickFile(props.fileFilters);
  } else {
    picked = await pickDirectory();
  }

  if (picked) {
    emit("update:modelValue", picked);
  }
}
</script>

<template>
  <div class="path-input">
    <el-input
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      size="small"
      @update:model-value="onInput"
    />
    <el-button size="small" :disabled="disabled" @click="browse">浏览...</el-button>
  </div>
</template>

<style scoped>
.path-input {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 4px;
  align-items: center;
}

.path-input :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
</style>
