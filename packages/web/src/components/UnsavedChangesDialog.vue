<script setup lang="ts">
import { ref } from "vue";

type UnsavedAction = "save" | "discard" | "cancel";

const visible = ref(false);
let resolveFn: ((value: UnsavedAction) => void) | null = null;
let pendingPromise: Promise<UnsavedAction> | null = null;

function open(): Promise<UnsavedAction> {
  if (pendingPromise) {
    return pendingPromise;
  }
  visible.value = true;
  pendingPromise = new Promise<UnsavedAction>((resolve) => {
    resolveFn = resolve;
  });
  return pendingPromise;
}

function settle(action: UnsavedAction): void {
  const resolver = resolveFn;
  resolveFn = null;
  pendingPromise = null;
  if (resolver) {
    resolver(action);
  }
}

function choose(action: UnsavedAction): void {
  visible.value = false;
  settle(action);
}

function onDialogClose(): void {
  settle("cancel");
}

defineExpose({ open });
</script>

<template>
  <el-dialog
    v-model="visible"
    title="未保存的更改"
    width="420px"
    data-testid="unsaved-changes-dialog"
    :close-on-click-modal="false"
    @close="onDialogClose"
  >
    <p class="m3-unsaved-text">当前服务器配置有未保存的修改。是否保存后再继续？</p>
    <template #footer>
      <div class="m3-unsaved-footer">
        <el-button text data-testid="btn-unsaved-cancel" @click="choose('cancel')">取消</el-button>
        <el-button type="danger" data-testid="btn-unsaved-discard" @click="choose('discard')">不保存</el-button>
        <el-button type="primary" data-testid="btn-unsaved-save" @click="choose('save')">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.m3-unsaved-text {
  margin: 0;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface-variant);
}

.m3-unsaved-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
