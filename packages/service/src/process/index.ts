import { ProcessManager, processManager } from "./manager.js";

export { ProcessManager, processManager };

// 兜底监听：spawn 失败只记录日志，绝不让单台服务器启动失败拖垮整个 Service。
processManager.on("spawn-error", (uuid: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[process] server ${uuid} spawn error: ${message}`);
});
