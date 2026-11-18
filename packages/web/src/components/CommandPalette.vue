<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { ServerSummary } from "@a3st/api-client";
import M3Icon from "@/components/M3Icon.vue";
import { searchCommands, type CommandPaletteItem } from "@/config/command-registry";

const props = defineProps<{
  modelValue: boolean;
  servers: ServerSummary[];
  selectedUuid: string;
  showAdvanced: boolean;
  activeTab: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "navigate-tab": [tab: string, highlight?: string, highlightAliases?: string[]];
  "select-server": [uuid: string];
  "exec-action": [actionId: string];
}>();

const query = ref("");
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const itemRefs = ref<Array<HTMLButtonElement | null>>([]);
let previousFocus: HTMLElement | null = null;

const items = computed(() =>
  searchCommands({
    query: query.value,
    servers: props.servers,
    selectedUuid: props.selectedUuid,
    showAdvanced: props.showAdvanced,
  })
);

const groupedItems = computed(() => {
  const groups: Array<{ groupLabel: string; entries: Array<{ item: CommandPaletteItem; index: number }> }> = [];
  const map = new Map<string, Array<{ item: CommandPaletteItem; index: number }>>();
  items.value.forEach((item, index) => {
    let list = map.get(item.groupLabel);
    if (!list) {
      list = [];
      map.set(item.groupLabel, list);
      groups.push({ groupLabel: item.groupLabel, entries: list });
    }
    list.push({ item, index });
  });
  return groups;
});

const activeItemId = computed(() => {
  const item = items.value[activeIndex.value];
  return item ? `m3-palette-opt-${item.id}` : undefined;
});

function findFirstEnabledIndex(list: CommandPaletteItem[]): number {
  const idx = list.findIndex((i) => !i.disabled);
  return idx >= 0 ? idx : 0;
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement as HTMLElement | null;
      query.value = "";
      activeIndex.value = findFirstEnabledIndex(items.value);
      await nextTick();
      inputRef.value?.focus();
    } else {
      const target = previousFocus;
      previousFocus = null;
      await nextTick();
      if (target && typeof target.focus === "function" && document.contains(target)) {
        target.focus();
      }
    }
  }
);

watch(items, (list) => {
  if (list.length === 0) {
    activeIndex.value = -1;
    return;
  }
  const current = list[activeIndex.value];
  if (!current || current.disabled) {
    activeIndex.value = findFirstEnabledIndex(list);
  }
});

function setItemRef(el: unknown, index: number) {
  itemRefs.value[index] = el instanceof HTMLButtonElement ? el : null;
}

function moveActive(delta: 1 | -1) {
  const list = items.value;
  if (list.length === 0) {
    return;
  }
  const len = list.length;
  let next = activeIndex.value;
  for (let step = 0; step < len; step++) {
    next = (next + delta + len) % len;
    if (!list[next].disabled) {
      activeIndex.value = next;
      nextTick(() => {
        itemRefs.value[next]?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
  }
}

function closeOnly() {
  emit("update:modelValue", false);
}

function selectItem(item: CommandPaletteItem) {
  if (item.disabled) {
    return;
  }
  // Clear previousFocus before closing when executing an action so focus moves cleanly
  // to any opened confirmation dialog or navigated view rather than snapping back to the trigger.
  previousFocus = null;
  emit("update:modelValue", false);

  if (item.group === "tab" || item.group === "setting") {
    if (item.tab) {
      emit("navigate-tab", item.tab, item.highlight, item.highlightAliases);
    }
    return;
  }
  if (item.group === "server" && item.serverUuid) {
    emit("select-server", item.serverUuid);
    return;
  }
  if (item.group === "action" && item.actionId) {
    emit("exec-action", item.actionId);
  }
}

// 中文/日文输入法组字期间，Enter、方向键用于确认候选词与移动候选项，
// 此时不能把它们当成"选中/导航"指令，否则用户第一次回车只是上屏却被跳走。
const isComposing = ref(false);
// Chrome/Edge 在"回车上屏"时会先触发 compositionend 再触发 keydown(Enter)，
// 此时 isComposing 已经是 false、keyCode 也不是 229，需要单独吃掉这次 Enter。
let suppressNextEnter = false;

function onCompositionStart(): void {
  isComposing.value = true;
  suppressNextEnter = false;
}

function onCompositionEnd(): void {
  isComposing.value = false;
  suppressNextEnter = true;
}

function onDialogKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.isComposing || event.keyCode === 229) {
    return;
  }
  if (event.key === "Enter" && suppressNextEnter) {
    suppressNextEnter = false;
    event.stopPropagation();
    return;
  }
  if (event.key !== "Enter") {
    suppressNextEnter = false;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeOnly();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
    return;
  }
  if (event.key === "Enter") {
    const item = items.value[activeIndex.value];
    if (item && !item.disabled) {
      event.preventDefault();
      selectItem(item);
    }
    return;
  }
  if (event.key === "Tab") {
    const root = dialogRef.value;
    if (!root) {
      return;
    }
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) {
      return;
    }
    const currentIdx = focusables.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const nextIdx = event.shiftKey
      ? (currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1)
      : (currentIdx + 1) % focusables.length;
    focusables[nextIdx]?.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="m3-palette-backdrop"
      @mousedown.self="closeOnly"
    >
      <div
        ref="dialogRef"
        class="m3-palette"
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="全局命令与配置搜索"
        @keydown="onDialogKeydown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      >
        <div class="m3-palette__header">
          <M3Icon name="search" :size="20" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="m3-palette__input"
            data-testid="command-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="m3-palette-listbox"
            :aria-activedescendant="activeItemId"
            placeholder="搜索页面、配置项（如 hostname / port / RCon）或快捷操作..."
          />
          <button
            v-if="query"
            type="button"
            class="m3-icon-btn"
            aria-label="清空搜索"
            @click="query = ''; inputRef?.focus()"
          >
            <M3Icon name="close" :size="18" />
          </button>
          <span class="m3-palette__esc">Esc</span>
        </div>

        <div id="m3-palette-listbox" class="m3-palette__list" role="listbox">
          <template v-if="groupedItems.length > 0">
            <template v-for="group in groupedItems" :key="group.groupLabel">
              <div class="m3-palette__group-label">{{ group.groupLabel }}</div>
              <button
                v-for="{ item, index } in group.entries"
                :id="`m3-palette-opt-${item.id}`"
                :key="item.id"
                :ref="(el) => setItemRef(el, index)"
                type="button"
                role="option"
                class="m3-palette__item"
                :class="{ 'is-active': index === activeIndex }"
                :aria-selected="index === activeIndex"
                :aria-disabled="item.disabled ? 'true' : undefined"
                :disabled="item.disabled"
                @mouseenter="!item.disabled && (activeIndex = index)"
                @click="selectItem(item)"
              >
                <M3Icon :name="item.icon" :size="18" />
                <span class="m3-palette__item-body">
                  <span class="m3-palette__item-title">{{ item.title }}</span>
                  <span class="m3-palette__item-sub">{{ item.subtitle }}</span>
                </span>
                <span v-if="item.badge" class="m3-palette__badge">{{ item.badge }}</span>
              </button>
            </template>
          </template>
          <div v-else class="m3-palette__empty">
            未找到匹配「{{ query }}」的页面、配置项或操作
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
