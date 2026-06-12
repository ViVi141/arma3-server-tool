export type AppTheme = "light" | "dark";
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "a3st-theme-mode";

let systemDark = false;
let electronRemove: (() => void) | null = null;
let mqRemove: (() => void) | null = null;

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyThemeFromMode(mode);
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function resolveSystemDark(): boolean {
  return systemDark;
}

export function applyThemeFromMode(mode: ThemeMode): void {
  if (mode === "light") {
    applyAppTheme("light");
    return;
  }
  if (mode === "dark") {
    applyAppTheme("dark");
    return;
  }
  applyAppTheme(resolveSystemDark() ? "dark" : "light");
}

function onSystemDarkChanged(dark: boolean): void {
  systemDark = dark;
  if (getThemeMode() === "system") {
    applyAppTheme(dark ? "dark" : "light");
  }
}

export function initSystemTheme(): () => void {
  const cleaners: Array<() => void> = [];

  if (window.electronAPI?.getThemeDark && window.electronAPI?.onThemeChanged) {
    window.electronAPI.getThemeDark().then((dark) => {
      onSystemDarkChanged(dark);
      applyThemeFromMode(getThemeMode());
    });
    electronRemove = window.electronAPI.onThemeChanged((dark) => {
      onSystemDarkChanged(dark);
    });
    cleaners.push(() => {
      if (electronRemove) {
        electronRemove();
        electronRemove = null;
      }
    });
  } else {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    systemDark = mq.matches;
    const onChange = (event: MediaQueryListEvent) => {
      onSystemDarkChanged(event.matches);
    };
    mq.addEventListener("change", onChange);
    mqRemove = () => mq.removeEventListener("change", onChange);
    cleaners.push(() => {
      if (mqRemove) {
        mqRemove();
        mqRemove = null;
      }
    });
  }

  applyThemeFromMode(getThemeMode());

  return () => {
    for (const clean of cleaners) {
      clean();
    }
  };
}
