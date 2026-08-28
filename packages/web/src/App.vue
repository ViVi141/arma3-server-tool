<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/utils/systemTheme";
import { getVisualTheme, setVisualTheme, type VisualTheme } from "@/utils/visualTheme";

const route = useRoute();
const isConsole = () => route.path.startsWith("/console/");
const isMobile = import.meta.env.VITE_APP_MODE === "mobile";

const themeMode = ref<ThemeMode>("system");
const visualTheme = ref<VisualTheme>("ark");

onMounted(() => {
  themeMode.value = getThemeMode();
  visualTheme.value = getVisualTheme();
});

function onThemeModeChange(mode: ThemeMode) {
  themeMode.value = mode;
  setThemeMode(mode);
}

function onVisualThemeChange(theme: VisualTheme) {
  visualTheme.value = theme;
  setVisualTheme(theme);
}
</script>

<template>
  <div class="app-shell">
    <div v-if="!isConsole()" class="title-bar">
      <div class="title-bar-left">
        <span class="app-mark" aria-hidden="true" />
        <span class="app-name">Arma3 Server Tools</span>
        <span class="app-version">v2.0</span>
      </div>
      <div class="title-bar-center" />
      <div class="title-bar-right">
        <label v-if="!isMobile" class="theme-picker">
          <span class="theme-picker__label">壳层</span>
          <select
            data-testid="visual-theme-select"
            class="theme-picker__select"
            :value="visualTheme"
            @change="onVisualThemeChange(($event.target as HTMLSelectElement).value as VisualTheme)"
          >
            <option value="ark">ark</option>
            <option value="classic">classic</option>
          </select>
        </label>
        <label v-if="!isMobile" class="theme-picker">
          <span class="theme-picker__label">明暗</span>
          <select
            data-testid="theme-mode-select"
            class="theme-picker__select"
            :value="themeMode"
            @change="onThemeModeChange(($event.target as HTMLSelectElement).value as ThemeMode)"
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <router-link
          v-if="isConsole()"
          to="/connections"
          class="title-link"
          data-testid="nav-connections"
        >
          连接
        </router-link>
        <router-link
          v-if="!isMobile"
          to="/settings/host"
          class="title-link"
        >
          被控设置
        </router-link>
        <router-link
          v-if="!isMobile"
          to="/demo"
          class="title-link"
          data-testid="nav-style-demo"
        >
          风格演示
        </router-link>
      </div>
    </div>
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.theme-picker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 4px;
}

.theme-picker__label {
  font-size: 11px;
  color: var(--a3st-text-dim);
}

.theme-picker__select {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 4px;
  border: 1px solid var(--a3st-border);
  background: var(--a3st-bg-input);
  color: var(--a3st-text);
  border-radius: 2px;
  cursor: pointer;
}

.theme-picker__select:focus-visible {
  outline: 2px solid var(--a3st-accent);
  outline-offset: 1px;
}
</style>
