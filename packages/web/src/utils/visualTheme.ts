/** 界面壳层：classic = VS Code 工具风；ark = 演示用工业风（默认已停用） */
export type VisualTheme = "classic" | "ark";

const STORAGE_KEY = "a3st-visual-theme";

export function getVisualTheme(): VisualTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "classic") {
    return "classic";
  }
  if (stored === "ark") {
    localStorage.setItem(STORAGE_KEY, "classic");
  }
  return "classic";
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
