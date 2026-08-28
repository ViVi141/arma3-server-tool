<script setup lang="ts">
import type { ConsoleMode } from "@/config/console-modes";
import type { TabEntry } from "@/config/tab-registry";
import type { ServerSummary } from "@a3st/api-client";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/utils/systemTheme";
import { getVisualTheme, setVisualTheme, type VisualTheme } from "@/utils/visualTheme";
import { ref, onMounted } from "vue";

defineProps<{
  modes: ConsoleMode[];
  activeModeId: string;
  activeTab: string;
  subTabs: TabEntry[];
  hasDirtyChanges: boolean;
  selectedUuid: string;
  servers: ServerSummary[];
  loading: boolean;
  searchText: string;
  isRunning: boolean;
  statusText: string;
  statusBarDir: string;
  syncStatusText: string;
  serverDotClass: (uuid: string) => string;
}>();

defineEmits<{
  "update:searchText": [value: string];
  "navigate-mode": [modeId: string];
  "navigate-tab": [tabName: string];
  "select-server": [uuid: string];
  "create-server": [];
  "open-wizard": [];
  rename: [];
  clone: [];
  delete: [];
  "open-dir": [];
}>();

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
  <div class="shell-v2" data-testid="console-shell">
    <header class="shell-v2__topbar">
      <div class="shell-v2__brand">
        <span class="shell-v2__mark" aria-hidden="true"><i /><i /><i /></span>
        <span class="shell-v2__wordmark">
          <strong>A3ST</strong>
          <small>CONSOLE</small>
        </span>
      </div>

      <el-dropdown
        trigger="click"
        class="shell-v2__instance"
        data-testid="server-panel"
        :disabled="loading && servers.length === 0"
      >
        <button type="button" class="shell-v2__instance-trigger">
          <span v-if="selectedUuid" :class="serverDotClass(selectedUuid)" aria-hidden="true" />
          <span class="shell-v2__instance-name">
            {{
              servers.find((s) => s.uuid === selectedUuid)?.configName ?? "选择实例"
            }}
          </span>
          <span class="shell-v2__instance-caret">▾</span>
        </button>
        <template #dropdown>
          <div class="shell-v2__instance-menu" data-testid="server-list">
            <el-input
              :model-value="searchText"
              placeholder="筛选实例..."
              size="small"
              clearable
              class="shell-v2__instance-search"
              @update:model-value="$emit('update:searchText', $event)"
            />
            <div
              v-for="s in servers.filter(
                (item) =>
                  !searchText ||
                  item.configName.toLowerCase().includes(searchText.toLowerCase())
              )"
              :key="s.uuid"
              class="shell-v2__instance-row"
              :class="{ 'is-active': s.uuid === selectedUuid }"
              :data-testid="'server-item-' + s.uuid"
              @click="$emit('select-server', s.uuid)"
            >
              <span :class="serverDotClass(s.uuid)" aria-hidden="true" />
              <span>{{ s.configName }}</span>
            </div>
            <div v-if="!loading && servers.length === 0" class="shell-v2__instance-empty" data-testid="server-empty-state">
              <p>尚无服务器配置</p>
            </div>
            <div class="shell-v2__instance-actions">
              <el-button size="small" type="primary" data-testid="btn-first-server-wizard" @click="$emit('open-wizard')">
                首服向导
              </el-button>
              <el-button size="small" data-testid="btn-new-server" @click="$emit('create-server')">新建</el-button>
              <el-button size="small" :disabled="!selectedUuid" @click="$emit('rename')">重命名</el-button>
              <el-button size="small" :disabled="!selectedUuid" @click="$emit('clone')">复制</el-button>
              <el-button size="small" type="danger" :disabled="!selectedUuid" @click="$emit('delete')">删除</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>

      <p class="shell-v2__relay">
        <span v-if="isRunning" class="shell-v2__pulse" aria-hidden="true" />
        {{ statusText }}
      </p>

      <div class="shell-v2__topbar-right">
        <label class="shell-v2__picker">
          <span>壳层</span>
          <select
            data-testid="visual-theme-select"
            :value="visualTheme"
            @change="onVisualThemeChange(($event.target as HTMLSelectElement).value as VisualTheme)"
          >
            <option value="ark">ark</option>
            <option value="classic">classic</option>
          </select>
        </label>
        <label class="shell-v2__picker">
          <span>明暗</span>
          <select
            data-testid="theme-mode-select"
            :value="themeMode"
            @change="onThemeModeChange(($event.target as HTMLSelectElement).value as ThemeMode)"
          >
            <option value="system">系统</option>
            <option value="light">浅</option>
            <option value="dark">深</option>
          </select>
        </label>
        <router-link to="/connections" class="shell-v2__link" data-testid="nav-connections">连接</router-link>
      </div>
    </header>

    <div class="shell-v2__body">
      <aside class="shell-v2__rail" data-testid="nav-panel" aria-label="控制台模式">
        <button
          v-for="mode in modes"
          :key="mode.id"
          type="button"
          class="shell-v2__rail-item"
          :class="{ 'is-active': activeModeId === mode.id }"
          :data-testid="'mode-' + mode.id"
          :disabled="!selectedUuid && mode.id !== 'overview'"
          @click="$emit('navigate-mode', mode.id)"
        >
          <span class="shell-v2__rail-index">{{ mode.index }}</span>
          <span class="shell-v2__rail-label">{{ mode.label }}</span>
        </button>
      </aside>

      <div class="shell-v2__stage">
        <nav v-if="subTabs.length > 1" class="shell-v2__subnav" aria-label="子页面">
          <button
            v-for="tab in subTabs"
            :key="tab.name"
            type="button"
            class="shell-v2__subnav-item"
            :data-testid="'nav-' + tab.name"
            :class="{ 'is-active': activeTab === tab.name, 'is-dirty': tab.name === activeTab && hasDirtyChanges }"
            :disabled="!selectedUuid"
            @click="$emit('navigate-tab', tab.name)"
          >
            {{ tab.label
            }}<span v-if="tab.name === activeTab && hasDirtyChanges" class="shell-v2__dirty">*</span>
          </button>
        </nav>

        <div v-if="$slots.actions && selectedUuid" class="shell-v2__actions">
          <slot name="actions" />
        </div>

        <div class="shell-v2__content">
          <slot />
        </div>

        <footer class="shell-v2__baseline" data-testid="status-bar">
          <span class="shell-v2__baseline-left">
            <span class="shell-v2__baseline-tag">PATH</span>
            <a href="#" class="shell-v2__baseline-link" @click.prevent="$emit('open-dir')">{{ statusBarDir }}</a>
            <span class="shell-v2__baseline-sep">|</span>
            <span class="shell-v2__baseline-tag">SYNC</span>
            <span>{{ syncStatusText }}</span>
          </span>
          <span class="shell-v2__baseline-right">A3ST v2.0</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell-v2__mark i {
  position: absolute;
  width: 1.4rem;
  height: 2px;
  background: currentColor;
  transform-origin: center;
}

.shell-v2__mark i:nth-child(1) {
  transform: rotate(0deg);
}

.shell-v2__mark i:nth-child(2) {
  transform: rotate(60deg);
}

.shell-v2__mark i:nth-child(3) {
  transform: rotate(-60deg);
}

.shell-v2__instance-menu {
  min-width: 240px;
  padding: 8px;
}

.shell-v2__instance-search {
  margin-bottom: 6px;
}

.shell-v2__instance-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
}

.shell-v2__instance-row:hover {
  background: var(--a3st-bg-hover);
}

.shell-v2__instance-row.is-active {
  background: var(--a3st-bg-active);
  box-shadow: inset 2px 0 0 var(--a3st-accent);
}

.shell-v2__instance-empty {
  padding: 12px 8px;
  font-size: 13px;
  color: var(--a3st-text-dim);
  text-align: center;
}

.shell-v2__instance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--a3st-border-subtle);
}

.global-settings .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}
</style>
