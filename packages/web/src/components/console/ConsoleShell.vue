<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { ConsoleMode } from "@/config/console-modes";
import type { TabEntry } from "@/config/tab-registry";
import type { ServerSummary } from "@a3st/api-client";
import M3Icon from "@/components/M3Icon.vue";
import CommandPalette from "@/components/CommandPalette.vue";
import { useThemeMode } from "@/config/theme";
import { useUiSettingsStore } from "@/stores/uiSettings";

const props = defineProps<{
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

const emit = defineEmits<{
  "update:searchText": [value: string];
  "navigate-mode": [modeId: string];
  "navigate-tab": [tabName: string];
  "navigate-tab-from-palette": [tabName: string, highlight?: string, highlightAliases?: string[]];
  "select-server": [uuid: string];
  "exec-action-from-palette": [actionId: string];
  "create-server": [];
  "open-wizard": [];
  rename: [];
  clone: [];
  delete: [];
  "open-dir": [];
}>();

const isMobile = import.meta.env.VITE_APP_MODE === "mobile";
const appVersion = __APP_VERSION__;
const uiSettings = useUiSettingsStore();
const { themeMode, themeIcon, themeLabel, cycleThemeMode } = useThemeMode();

const paletteOpen = ref(false);

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k" && !event.isComposing) {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});

function onSubTabSelect(tabName: string | number | boolean | undefined) {
  if (typeof tabName !== "string" || !tabName) {
    return;
  }
  emit("navigate-tab", tabName);
}

function subTabOptionLabel(tab: TabEntry): string {
  if (tab.name === props.activeTab && props.hasDirtyChanges) {
    return tab.label + " *";
  }
  return tab.label;
}
</script>

<template>
  <div class="shell-v2" data-testid="console-shell">
    <header class="shell-v2__topbar">
      <div class="shell-v2__brand">
        <span class="shell-v2__mark" aria-hidden="true">
          <M3Icon name="dns" :size="18" />
        </span>
        <span class="shell-v2__wordmark">
          <strong>A3ST</strong>
          <small>服务器控制台</small>
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
          <M3Icon name="expand_more" :size="16" class="shell-v2__instance-caret" />
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

      <button
        type="button"
        class="m3-search-trigger"
        data-testid="btn-command-palette"
        aria-label="全局命令与配置搜索 (Ctrl+K)"
        title="全局搜索 (Ctrl+K)"
        @click="paletteOpen = true"
      >
        <M3Icon name="search" :size="18" />
        <span class="m3-search-trigger__text">搜索配置、页面或操作...</span>
        <kbd class="m3-search-trigger__kbd">Ctrl+K</kbd>
      </button>

      <div class="shell-v2__topbar-right">
        <button
          type="button"
          class="m3-icon-btn"
          data-testid="theme-mode-select"
          :data-theme-mode="themeMode"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="cycleThemeMode"
        >
          <M3Icon :name="themeIcon" :size="20" />
        </button>
        <router-link
          to="/connections"
          class="shell-v2__link"
          data-testid="nav-connections"
          title="返回主机连接列表"
        >
          <M3Icon name="logout" :size="18" />
          <span>切换主机</span>
        </router-link>
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
          <M3Icon
            :name="mode.icon"
            :size="20"
            :filled="activeModeId === mode.id"
            class="shell-v2__rail-icon"
          />
          <span class="shell-v2__rail-label">{{ mode.label }}</span>
        </button>
      </aside>

      <div class="shell-v2__stage">
        <div
          v-if="isMobile && subTabs.length > 1"
          class="shell-v2__subnav-select"
          aria-label="子页面"
        >
          <el-select
            :key="activeTab"
            :model-value="activeTab"
            :disabled="!selectedUuid"
            data-testid="nav-subtab-select"
            style="width: 100%"
            @update:model-value="onSubTabSelect"
          >
            <el-option
              v-for="tab in subTabs"
              :key="tab.name"
              :label="subTabOptionLabel(tab)"
              :value="tab.name"
            />
          </el-select>
        </div>
        <nav
          v-else-if="!isMobile && subTabs.length > 1"
          class="shell-v2__subnav"
          aria-label="子页面"
        >
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
            <M3Icon v-if="tab.icon" :name="tab.icon" :size="16" />
            <span>{{ tab.label }}</span>
            <span v-if="tab.name === activeTab && hasDirtyChanges" class="shell-v2__dirty">*</span>
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
            <span class="shell-v2__baseline-tag">路径</span>
            <a href="#" class="shell-v2__baseline-link" @click.prevent="$emit('open-dir')">{{ statusBarDir }}</a>
            <span class="shell-v2__baseline-sep">|</span>
            <span class="shell-v2__baseline-tag">同步</span>
            <span>{{ syncStatusText }}</span>
          </span>
          <span class="shell-v2__baseline-right">A3ST v{{ appVersion }}</span>
        </footer>
      </div>
    </div>

    <CommandPalette
      v-model="paletteOpen"
      :servers="servers"
      :selected-uuid="selectedUuid"
      :show-advanced="uiSettings.showAdvancedSettings"
      :active-tab="activeTab"
      @navigate-tab="(tab, highlight, aliases) => $emit('navigate-tab-from-palette', tab, highlight, aliases)"
      @select-server="(uuid) => $emit('select-server', uuid)"
      @exec-action="(actionId) => $emit('exec-action-from-palette', actionId)"
    />
  </div>
</template>

<style scoped>
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
  padding: 8px 10px;
  border-radius: var(--md-sys-shape-corner-sm);
  cursor: pointer;
  font-size: 13px;
}

.shell-v2__instance-row:hover {
  background: var(--a3st-bg-hover);
}

.shell-v2__instance-row.is-active {
  background: var(--a3st-bg-active);
  color: var(--md-sys-color-on-secondary-container);
  font-weight: 500;
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
</style>
