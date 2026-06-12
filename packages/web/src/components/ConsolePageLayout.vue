<script setup lang="ts">
withDefaults(
  defineProps<{
    padded?: boolean;
  }>(),
  {
    padded: true,
  }
);
</script>

<template>
  <div class="console-page">
    <div v-if="$slots.toolbar" class="console-page__toolbar">
      <slot name="toolbar" />
    </div>
    <div v-if="$slots.hint" class="console-page__hint">
      <slot name="hint" />
    </div>
    <el-scrollbar class="console-page__scroll">
      <div
        class="console-page__inner"
        :class="{ 'console-page__inner--padded': padded }"
      >
        <slot />
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.console-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.console-page__toolbar {
  flex-shrink: 0;
  padding: 4px 8px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  border-bottom: 1px solid var(--a3st-border-subtle);
  background: var(--a3st-toolbar);
  min-height: 28px;
}

.console-page__hint {
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--a3st-text-muted);
  background: var(--a3st-bg-elevated);
  border-bottom: 1px solid var(--a3st-border-subtle);
}

.console-page__scroll {
  flex: 1;
  min-height: 0;
}

.console-page__scroll :deep(.el-scrollbar__view) {
  height: 100%;
}

.console-page__inner {
  min-height: min-content;
}

.console-page__inner--padded {
  padding: 6px 8px;
}
</style>
