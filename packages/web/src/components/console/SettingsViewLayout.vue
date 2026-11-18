<script setup lang="ts">
import { UI_COPY } from "@/constants/uiCopy";

withDefaults(
  defineProps<{
    kicker: string;
    title: string;
    hint?: string;
    showSave?: boolean;
    allowReset?: boolean;
    saving?: boolean;
  }>(),
  {
    hint: undefined,
    showSave: false,
    allowReset: false,
    saving: false,
  }
);

const emit = defineEmits<{
  save: [];
  reset: [];
}>();
</script>

<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <p class="settings-page__kicker">{{ kicker }}</p>
      <h1 class="settings-page__title">{{ title }}</h1>
      <div class="settings-page__rule" aria-hidden="true" />
      <p v-if="hint" class="settings-page__hint">{{ hint }}</p>
      <div v-if="showSave" class="settings-page__actions">
        <el-button
          v-if="allowReset"
          text
          size="small"
          data-testid="btn-page-reset"
          @click="emit('reset')"
        >
          恢复默认值
        </el-button>
        <el-button
          type="primary"
          size="small"
          :loading="saving"
          data-testid="btn-page-save"
          @click="emit('save')"
        >
          {{ UI_COPY.saveShort }}
        </el-button>
      </div>
    </header>
    <div class="settings-page__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-page__actions {
  margin-top: 10px;
}
</style>
