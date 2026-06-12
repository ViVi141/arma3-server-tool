export type AppTheme = "light" | "dark";

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function initSystemTheme(): () => void {
  const cleaners: Array<() => void> = [];

  if (window.electronAPI?.getThemeDark && window.electronAPI?.onThemeChanged) {
    window.electronAPI.getThemeDark().then((dark) => {
      applyAppTheme(dark ? "dark" : "light");
    });
    const remove = window.electronAPI.onThemeChanged((dark) => {
      applyAppTheme(dark ? "dark" : "light");
    });
    cleaners.push(remove);
    return () => {
      for (const clean of cleaners) {
        clean();
      }
    };
  }

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  applyAppTheme(mq.matches ? "dark" : "light");

  const onChange = (event: MediaQueryListEvent) => {
    applyAppTheme(event.matches ? "dark" : "light");
  };
  mq.addEventListener("change", onChange);
  cleaners.push(() => mq.removeEventListener("change", onChange));

  return () => {
    for (const clean of cleaners) {
      clean();
    }
  };
}
