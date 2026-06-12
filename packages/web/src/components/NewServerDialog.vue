<script setup lang="ts">
import { ref, watch } from "vue";
import PathInput from "@/components/PathInput.vue";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [payload: { configName: string; serverDir: string }];
}>();

const configName = ref("新服务器");
const serverDir = ref("");

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      configName.value = "新服务器";
      serverDir.value = "";
    }
  }
);

function close() {
  emit("update:modelValue", false);
}

function onConfirm() {
  const name = configName.value.trim();
  if (!name) {
    return;
  }
  emit("confirm", { configName: name, serverDir: serverDir.value.trim() });
  close();
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="新建服务器配置"
    width="520px"
    destroy-on-close
    data-testid="new-server-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="96px" size="small" @submit.prevent="onConfirm">
      <el-form-item label="配置名称" required>
        <el-input v-model="configName" placeholder="新服务器" data-testid="new-server-name" />
      </el-form-item>
      <el-form-item label="服务器目录">
        <PathInput v-model="serverDir" mode="directory" placeholder="留空则使用默认目录" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" data-testid="new-server-confirm" @click="onConfirm">创建</el-button>
    </template>
  </el-dialog>
</template>
