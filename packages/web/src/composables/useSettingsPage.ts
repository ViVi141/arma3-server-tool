import { ref, watch, onMounted, provide, type InjectionKey } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { applyDefaults } from "@/utils/defaults";
import { useConfigEditorRegistration } from "./configEditor";
import { DEFAULTS } from "@/utils/defaults";
import { cloneDefaultValue, defaultLabelOf, defaultValueOf, isBooleanLike } from "@/config/server-defaults";

export interface SettingsDefaultsContext {
  defaultLabel: (path: string) => string;
  resetField: (path: string) => void;
}

export const SETTINGS_DEFAULTS_KEY: InjectionKey<SettingsDefaultsContext> = Symbol("settingsDefaults");

export function useSettingsPage(
  getServerUuid: () => string,
  label: string,
  buildPatch: () => Record<string, unknown>
) {
  const store = useConnectionsStore();
  const cfg = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const saving = ref(false);
  let trackDirty = false;

  async function load(): Promise<void> {
    loading.value = true;
    trackDirty = false;
    try {
      const client = store.getClient();
      if (!client) {
        return;
      }
      const res = await client.getConfig(getServerUuid());
      if (res.success) {
        cfg.value = applyDefaults(res.data as Record<string, unknown>);
      }
    } finally {
      loading.value = false;
      trackDirty = true;
    }
  }

  let markCleanRef: () => void = () => {};

  async function save(): Promise<void> {
    saving.value = true;
    try {
      const client = store.getClient();
      if (!client) {
        throw new Error("未连接");
      }
      const res = await client.patchConfig(getServerUuid(), buildPatch() as never);
      // 客户端不会对 4xx/5xx 抛异常，这里必须自己判定，否则失败也会被当成"已保存"
      if (!res.success) {
        throw new Error(res.error ?? "保存失败");
      }
      markCleanRef();
      ElMessage.success("已保存");
    } catch (e: unknown) {
      ElMessage.error(e instanceof Error ? e.message : "保存失败");
      throw e;
    } finally {
      saving.value = false;
    }
  }

  const { markDirty, markClean } = useConfigEditorRegistration(getServerUuid, {
    label,
    save,
    reload: load,
  });
  markCleanRef = markClean;

  watch(
    cfg,
    () => {
      if (trackDirty) {
        markDirty();
      }
    },
    { deep: true }
  );

  watch(getServerUuid, () => {
    load().then(() => {
      markClean();
    });
  });

  onMounted(() => {
    load().then(() => {
      markClean();
    });
  });

  function ensureSection(section: string): Record<string, unknown> {
    const current = cfg.value[section];
    if (current && typeof current === "object") {
      return current as Record<string, unknown>;
    }
    const created: Record<string, unknown> = {};
    cfg.value[section] = created;
    return created;
  }

  /** 单个参数恢复默认：只改本地表单，仍需点保存才落库 */
  function resetField(path: string): void {
    const [section, key] = path.split(".");
    if (!section || !key || defaultValueOf(path) === undefined) {
      return;
    }
    ensureSection(section)[key] = cloneDefaultValue(path);
  }

  /** 整页恢复默认：只覆盖本页管辖的 section，同样需要保存才落库 */
  function resetAll(): void {
    for (const section of Object.keys(buildPatch())) {
      const defaults = DEFAULTS[section];
      if (!defaults) {
        continue;
      }
      const target = ensureSection(section);
      for (const [key, value] of Object.entries(defaults)) {
        target[key] = Array.isArray(value) ? [...value] : value;
      }
    }
  }

  provide(SETTINGS_DEFAULTS_KEY, {
    defaultLabel: (path: string) => {
      const value = defaultValueOf(path);
      if (typeof value === "boolean" || (isBooleanLike(path) && typeof value === "number")) {
        const truthy = typeof value === "boolean" ? value : value !== 0;
        return truthy ? "开" : "关";
      }
      if (value === undefined || value === null || value === "") {
        return "空";
      }
      return String(value);
    },
    resetField,
  });

  return { cfg, loading, saving, load, save, markDirty, markClean, resetField, resetAll };
}
