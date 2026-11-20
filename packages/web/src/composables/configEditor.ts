import { inject, onMounted, onUnmounted, type InjectionKey } from "vue";
import { useConfigSessionStore } from "@/stores/configSession";

export interface ConfigEditorRegistration {
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
  isDirty: () => boolean;
  label: string;
}

export interface ConfigEditorContext {
  register: (registration: ConfigEditorRegistration | null) => void;
  onSaved: () => void;
}

export const CONFIG_EDITOR_KEY: InjectionKey<ConfigEditorContext> = Symbol("configEditor");

// 保存失败的具体原因（如迁移阻断、Cron 无效）不能让全局「保存失败」盖掉；
// 页面通过 consumeLastSaveError 取用一次，避免重复提示。
let lastSaveError: string | null = null;
export function consumeLastSaveError(): string | null {
  const message = lastSaveError;
  lastSaveError = null;
  return message;
}

export function useConfigEditorRegistration(
  getServerUuid: () => string,
  options: {
    label: string;
    save: () => Promise<void>;
    reload: () => Promise<void>;
  }
): { markDirty: () => void; markClean: () => void } {
  const configSession = useConfigSessionStore();
  const ctx = inject(CONFIG_EDITOR_KEY, null);

  onMounted(() => {
    if (!ctx) {
      return;
    }
    ctx.register({
      label: options.label,
      isDirty: () => configSession.isDirty(getServerUuid()),
      save: async () => {
        try {
          await options.save();
          lastSaveError = null;
          configSession.markClean(getServerUuid());
          ctx.onSaved();
          return true;
        } catch (error) {
          lastSaveError = error instanceof Error && error.message ? error.message : null;
          return false;
        }
      },
      discard: async () => {
        await options.reload();
        configSession.markClean(getServerUuid());
      },
    });
  });

  onUnmounted(() => {
    ctx?.register(null);
  });

  return {
    markDirty: () => configSession.markDirty(getServerUuid()),
    markClean: () => configSession.markClean(getServerUuid()),
  };
}
