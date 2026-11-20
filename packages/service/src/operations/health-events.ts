import type { FastifyInstance } from "fastify";
import type { ServerHealthData } from "../types/health.js";

/** 仅当前证据确认健康才恢复告警；停止/接管/维护/无法采样都不是故障恢复。 */
export function wireHealthEvents(app: FastifyInstance): () => void {
  const listener = (health: ServerHealthData) => {
    try {
      if (health.state === "healthy") {
        for (const event of app.operations.activeEvents()) {
          if (event.type === "health_unhealthy" && event.serverUuids.includes(health.serverUuid)) app.operations.resolve(event.eventId);
        }
      } else if (health.state === "unhealthy" || (health.state === "unverified" && health.processAlive === null && app.configStore.load(health.serverUuid)?.health?.enabled)) {
        app.operations.record({ type: "health_unhealthy", severity: "critical", serverUuids: [health.serverUuid], modIds: [], batchId: null,
          reasonCode: "HEALTH_UNHEALTHY", message: [...health.configurationIssues, ...health.reasons].join("；"),
          suggestedAction: "查询本实例健康证据并检查启动模板、独立心跳与 RCon；不要用公网可达性或玩家入服作未经验证的结论。", requiresAttention: true });
      }
    } catch {
      app.log.error("健康事件持久化失败，将在下一次采样重试；没有宣布故障恢复");
    }
  };
  app.serverHealth.on("sample", listener);
  return () => app.serverHealth.off("sample", listener);
}
