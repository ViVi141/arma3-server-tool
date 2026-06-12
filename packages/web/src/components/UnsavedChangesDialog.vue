<script setup lang="ts">
import { ref } from "vue";

const visible = ref(false);
let resolveFn: ((value: "save" | "discard" | "cancel") => void) | null = null;

function open(): Promise<"save" | "discard" | "cancel"> {
  visible.value = true;
  return new Promise((resolve) => {
    resolveFn = resolve;
  });
}

function choose(action: "save" | "discard" | "cancel"): void {
  visible.value = false;
  if (resolveFn) {
    resolveFn(action);
    resolveFn = null;
  }
}

defineExpose({ open });
</script>

<template>
  <el-dialog v-model="visible" title="未保存的更改" width="420px" :close-on-click-modal="false">
    <p>当前服务器配置有未保存的修改。是否保存后再继续？</p>
    <template #footer>
      <el-button @click="choose('cancel')">取消</el-button>
      <el-button type="danger" @click="choose('discard')">不保存</el-button>
      <el-button type="primary" @click="choose('save')">保存</el-button>
    </template>
  </el-dialog>
</template>
