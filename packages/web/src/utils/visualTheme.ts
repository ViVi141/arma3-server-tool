/** 界面壳层：classic = VS Code 工具风；ark = ark-ui moderate */
export type VisualTheme = "classic" | "ark";

const STORAGE_KEY = "a3st-visual-theme";

export function getVisualTheme(): VisualTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "classic" || stored === "ark") {
    return stored;
  }
  return "ark";
}

export function setVisualTheme(theme: VisualTheme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyVisualTheme(theme);
}

export function applyVisualTheme(theme: VisualTheme): void {
  document.documentElement.dataset.visual = theme;
}

export function initVisualTheme(): void {
  applyVisualTheme(getVisualTheme());
}
