<script setup lang="ts">
import { UI_COPY } from "@/constants/uiCopy";

withDefaults(
  defineProps<{
    kicker: string;
    title: string;
    hint?: string;
    showSave?: boolean;
    saving?: boolean;
  }>(),
  {
    hint: undefined,
    showSave: false,
    saving: false,
  }
);

const emit = defineEmits<{
  save: [];
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
