<script setup lang="ts">
defineProps<{
  title: string;
  code?: string;
}>();
</script>

<template>
  <section class="ark-tech-panel">
    <header class="ark-tech-panel__head">
      <span v-if="code" class="ark-tech-panel__code">{{ code }}</span>
      <h3 class="ark-tech-panel__title">{{ title }}</h3>
    </header>
    <div class="ark-tech-panel__body">
      <slot />
    </div>
  </section>
</template>
