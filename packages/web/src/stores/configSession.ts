import { defineStore } from "pinia";

export const useConfigSessionStore = defineStore("configSession", {
  state: () => ({
    dirtyByUuid: {} as Record<string, boolean>,
  }),
  actions: {
    markDirty(uuid: string): void {
      this.dirtyByUuid[uuid] = true;
    },
    markClean(uuid: string): void {
      delete this.dirtyByUuid[uuid];
    },
    isDirty(uuid: string): boolean {
      return !!this.dirtyByUuid[uuid];
    },
    clearAll(): void {
      this.dirtyByUuid = {};
    },
  },
});
