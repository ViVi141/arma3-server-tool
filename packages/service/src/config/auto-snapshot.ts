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

  // 所有触发点都是「变更前」(Before*)：快照必须先于 save/write 完成。
  // 旧实现用 setImmediate 异步创建，实际拷贝到的是变更后的状态，
  // 「备份」失去意义（可能把坏配置覆盖进唯一一份备份）。
  try {
    app.snapshotStore.create(uuid, `自动备份 (${trigger})`);
  } catch (err) {
    app.log.warn({ err, uuid, trigger }, "自动快照创建失败（已跳过）");
  }

  const prune = (): void => {
    try {
      app.snapshotStore.prune(uuid, 10);
    } catch (err) {
      app.log.warn({ err, uuid }, "自动快照清理失败（已跳过）");
    }
  };
  if (settings.autoSnapshotAsync) {
    // 仅清理旧快照可以放到后台，不影响「变更前」语义。
    setImmediate(prune);
  } else {
    prune();
  }
}
