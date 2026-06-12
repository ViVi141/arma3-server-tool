import type { FastifyInstance } from "fastify";
import type { AutoSnapshotMode } from "../settings/ui-settings.js";

export type AutoSnapshotTrigger = "save" | "write";

function shouldSnapshot(mode: AutoSnapshotMode, trigger: AutoSnapshotTrigger): boolean {
  if (mode === "Off") {
    return false;
  }
  if (trigger === "save") {
    return mode === "BeforeSave";
  }
  return mode === "BeforeWrite" || mode === "BeforeSave";
}

export function maybeAutoSnapshot(
  app: FastifyInstance,
  uuid: string,
  trigger: AutoSnapshotTrigger
): void {
  const settings = app.uiSettingsStore.load();
  if (!shouldSnapshot(settings.autoSnapshotMode, trigger)) {
    return;
  }

  const create = (): void => {
    try {
      app.snapshotStore.create(uuid, `自动备份 (${trigger})`);
      app.snapshotStore.prune(uuid, 10);
    } catch {
      /* ignore snapshot failures */
    }
  };

  if (settings.autoSnapshotAsync) {
    setImmediate(create);
  } else {
    create();
  }
}
