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
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-low);
  min-height: 40px;
}

.console-page__hint {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: var(--md-sys-typescale-body-small-size);
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
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
  padding: 12px 16px 24px;
}
</style>
