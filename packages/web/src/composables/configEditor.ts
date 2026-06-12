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

export function useConfigEditorRegistration(
  serverUuid: string,
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
      isDirty: () => configSession.isDirty(serverUuid),
      save: async () => {
        try {
          await options.save();
          configSession.markClean(serverUuid);
          ctx.onSaved();
          return true;
        } catch {
          return false;
        }
      },
      discard: async () => {
        await options.reload();
        configSession.markClean(serverUuid);
      },
    });
  });

  onUnmounted(() => {
    ctx?.register(null);
  });

  return {
    markDirty: () => configSession.markDirty(serverUuid),
    markClean: () => configSession.markClean(serverUuid),
  };
}
