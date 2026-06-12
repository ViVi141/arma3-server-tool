import { defineStore } from "pinia";
import type { A3stClient, AutoSnapshotMode, UiSettings } from "@a3st/api-client";

const DEFAULTS: UiSettings = {
  showAdvancedSettings: true,
  allowExternalConfigRefresh: false,
  hasShownTrayMinimizeHint: false,
  autoSnapshotMode: "BeforeWrite",
  autoSnapshotAsync: true,
};

export const useUiSettingsStore = defineStore("uiSettings", {
  state: (): UiSettings & { loaded: boolean } => ({
    ...DEFAULTS,
    loaded: false,
  }),
  actions: {
    async loadFromApi(client: A3stClient): Promise<void> {
      const res = await client.getUiSettings();
      if (res.success) {
        this.showAdvancedSettings = res.data.showAdvancedSettings ?? DEFAULTS.showAdvancedSettings;
        this.allowExternalConfigRefresh = res.data.allowExternalConfigRefresh;
        this.hasShownTrayMinimizeHint = res.data.hasShownTrayMinimizeHint;
        this.autoSnapshotMode = res.data.autoSnapshotMode;
        this.autoSnapshotAsync = res.data.autoSnapshotAsync;
      }
      this.loaded = true;
    },
    async saveToApi(client: A3stClient): Promise<void> {
      const payload: UiSettings = {
        showAdvancedSettings: this.showAdvancedSettings,
        allowExternalConfigRefresh: this.allowExternalConfigRefresh,
        hasShownTrayMinimizeHint: this.hasShownTrayMinimizeHint,
        autoSnapshotMode: this.autoSnapshotMode,
        autoSnapshotAsync: this.autoSnapshotAsync,
      };
      await client.saveUiSettings(payload);
    },
    setShowAdvanced(value: boolean): void {
      this.showAdvancedSettings = value;
    },
    setAutoSnapshotMode(mode: AutoSnapshotMode): void {
      this.autoSnapshotMode = mode;
    },
    setAllowExternalRefresh(value: boolean): void {
      this.allowExternalConfigRefresh = value;
    },
    setAutoSnapshotAsync(value: boolean): void {
      this.autoSnapshotAsync = value;
    },
  },
});
