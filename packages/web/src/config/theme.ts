import { readonly, ref, computed } from "vue";
import { getThemeMode, setThemeMode, type AppTheme, type ThemeMode } from "@/utils/systemTheme";

function resolveCurrentAppTheme(mode: ThemeMode): AppTheme {
  if (mode === "light" || mode === "dark") {
    return mode;
  }
  if (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") {
    return "dark";
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

const themeModeRef = ref<ThemeMode>(typeof localStorage !== "undefined" ? getThemeMode() : "system");
const resolvedThemeRef = ref<AppTheme>(resolveCurrentAppTheme(themeModeRef.value));

let listenersInitialized = false;

function ensureSyncListeners(): void {
  if (listenersInitialized || typeof window === "undefined") {
    return;
  }
  listenersInitialized = true;

  const syncFromDom = () => {
    themeModeRef.value = getThemeMode();
    resolvedThemeRef.value = resolveCurrentAppTheme(themeModeRef.value);
  };

  window.addEventListener("storage", (e) => {
    if (e.key === "a3st-theme-mode") {
      setAppThemeMode(getThemeMode());
    }
  });

  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themeModeRef.value === "system") {
      resolvedThemeRef.value = resolveCurrentAppTheme("system");
    }
  });

  window.electronAPI?.onThemeChanged?.((dark: boolean) => {
    if (themeModeRef.value === "system") {
      resolvedThemeRef.value = dark ? "dark" : "light";
    }
  });

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      const domTheme = document.documentElement.dataset.theme;
      if (domTheme === "dark" || domTheme === "light") {
        resolvedThemeRef.value = domTheme;
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  syncFromDom();
}

export function setAppThemeMode(mode: ThemeMode): void {
  ensureSyncListeners();
  setThemeMode(mode);
  themeModeRef.value = mode;
  resolvedThemeRef.value = resolveCurrentAppTheme(mode);
}

export function cycleThemeMode(): ThemeMode {
  const order: ThemeMode[] = ["system", "light", "dark"];
  const idx = order.indexOf(themeModeRef.value);
  const next = order[(idx + 1) % order.length];
  setAppThemeMode(next);
  return next;
}

export function useThemeMode() {
  ensureSyncListeners();

  const themeIcon = computed(() => {
    if (themeModeRef.value === "light") {
      return "light_mode";
    }
    if (themeModeRef.value === "dark") {
      return "dark_mode";
    }
    return "brightness_auto";
  });

  const themeLabel = computed(() => {
    if (themeModeRef.value === "light") {
      return "主题：浅色（点击切换为深色）";
    }
    if (themeModeRef.value === "dark") {
      return "主题：深色（点击切换为跟随系统）";
    }
    return "主题：跟随系统（点击切换为浅色）";
  });

  return {
    themeMode: readonly(themeModeRef),
    resolvedTheme: readonly(resolvedThemeRef),
    setAppThemeMode,
    cycleThemeMode,
    themeIcon,
    themeLabel,
  };
}
