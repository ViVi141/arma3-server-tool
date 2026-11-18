<script setup lang="ts">
import { computed, inject } from "vue";
import { SETTINGS_DEFAULTS_KEY } from "@/composables/useSettingsPage";
import { defaultLabelOf, defaultSourceOf, sourceLabelOf } from "@/config/server-defaults";

const props = defineProps<{ path: string; note?: string }>();

const ctx = inject(SETTINGS_DEFAULTS_KEY, null);

const label = computed(() => ctx?.defaultLabel(props.path) ?? defaultLabelOf(props.path));

const known = computed(() => defaultSourceOf(props.path) !== "project");
const title = computed(() =>
  `${sourceLabelOf(props.path)}${known.value ? "" : "——如需以官方值为准，请核对后告知"}`
);

function reset(): void {
  ctx?.resetField(props.path);
}
</script>

<template>
  <p class="form-hint form-hint--param">
    <span v-if="note" class="form-hint__note">{{ note }}</span>
    <span class="param-default" :title="title" :class="{ 'is-unverified': !known }">
      默认：{{ label }}
    </span>
    <button type="button" class="param-reset" :title="`恢复为默认值${label}`" @click="reset">
      恢复默认
    </button>
  </p>
</template>
