import * as fs from "node:fs";
import * as path from "node:path";

export type AutoSnapshotMode = "Off" | "BeforeSave" | "BeforeWrite";

export interface UiSettings {
  showAdvancedSettings: boolean;
  allowExternalConfigRefresh: boolean;
  hasShownTrayMinimizeHint: boolean;
  autoSnapshotMode: AutoSnapshotMode;
  autoSnapshotAsync: boolean;
}

const DEFAULTS: UiSettings = {
  showAdvancedSettings: true,
  allowExternalConfigRefresh: false,
  hasShownTrayMinimizeHint: false,
  autoSnapshotMode: "BeforeWrite",
  autoSnapshotAsync: true,
};

export class UiSettingsStore {
  private filePath: string;

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "config");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "ui-settings.json");
  }

  load(): UiSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Partial<UiSettings>;
      return {
        showAdvancedSettings: raw.showAdvancedSettings ?? DEFAULTS.showAdvancedSettings,
        allowExternalConfigRefresh: raw.allowExternalConfigRefresh ?? DEFAULTS.allowExternalConfigRefresh,
        hasShownTrayMinimizeHint: raw.hasShownTrayMinimizeHint ?? DEFAULTS.hasShownTrayMinimizeHint,
        autoSnapshotMode: raw.autoSnapshotMode ?? DEFAULTS.autoSnapshotMode,
        autoSnapshotAsync: raw.autoSnapshotAsync ?? DEFAULTS.autoSnapshotAsync,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  save(settings: UiSettings): void {
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf-8");
  }
}
