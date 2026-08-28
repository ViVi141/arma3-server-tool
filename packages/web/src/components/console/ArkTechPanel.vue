<script setup lang="ts">
defineProps<{
  title: string;
  code?: string;
}>();
</script>

<template>
  <section class="ark-tech-panel">
    <header class="ark-tech-panel__head">
      <p v-if="code" class="ark-tech-panel__code">{{ code }}</p>
      <h3 class="ark-tech-panel__title">{{ title }}</h3>
      <div class="ark-tech-panel__rule" aria-hidden="true" />
    </header>
    <div class="ark-tech-panel__body">
      <slot />
    </div>
  </section>
</template>
