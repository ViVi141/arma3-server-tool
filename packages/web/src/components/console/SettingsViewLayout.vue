<script setup lang="ts">
defineProps<{
  kicker: string;
  title: string;
  hint?: string;
}>();
</script>

<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <p class="settings-page__kicker">{{ kicker }}</p>
      <h1 class="settings-page__title">{{ title }}</h1>
      <div class="settings-page__rule" aria-hidden="true" />
      <p v-if="hint" class="settings-page__hint">{{ hint }}</p>
    </header>
    <div class="settings-page__body">
      <slot />
    </div>
  </div>
</template>
