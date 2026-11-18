import { DEFAULTS } from "@/utils/defaults";

/**
 * 参数默认值来源说明。
 * - "basic.cfg"：Arma 3 官方 basic.cfg 参数表里的 Default 列（已核对）
 * - "server.cfg"：Arma 3 官方 server.cfg 文档（已核对）
 * - "project"：项目内置默认值，尚未逐条与官方文档核对
 */
export type DefaultSource = "basic.cfg" | "server.cfg" | "server.cfg-example" | "project";

const SOURCES: Record<string, DefaultSource> = {
  "basic.groupIndicators": "server.cfg-example",
  "basic.friendlyTags": "server.cfg-example",
  "basic.enemyTags": "server.cfg-example",
  "basic.detectedMines": "server.cfg-example",
  "basic.commands": "server.cfg-example",
  "basic.waypoints": "server.cfg-example",
  "basic.tacticalPing": "server.cfg-example",
  "basic.weaponInfo": "server.cfg-example",
  "basic.stanceIndicator": "server.cfg-example",
  "basic.staminaBar": "server.cfg-example",
  "basic.weaponCrosshair": "server.cfg-example",
  "basic.visionAid": "server.cfg-example",
  "basic.thirdPerson": "server.cfg-example",
  "basic.cameraShake": "server.cfg-example",
  "basic.scoreTable": "server.cfg-example",
  "basic.deathMessages": "server.cfg-example",
  "basic.vonId": "server.cfg-example",
  "basic.mapContent": "server.cfg-example",
  "basic.mapContentFriendly": "server.cfg-example",
  "basic.mapContentEnemy": "server.cfg-example",
  "basic.mapContentMines": "server.cfg-example",
  "basic.reducedDamage": "server.cfg-example",
  "basic.autoReport": "server.cfg-example",
  "basic.multipleSaves": "server.cfg-example",
  "basic.skillAi": "server.cfg-example",
  "basic.precisionAi": "server.cfg-example",
  "basic.maxPlayers": "basic.cfg",
  "basic.motd": "server.cfg",
  "basic.motdInterval": "server.cfg",
  "basic.voteThreshold": "server.cfg",
  "basic.voteMissionPlayers": "server.cfg",
  "basic.kickDuplicate": "server.cfg",
  "basic.loopback": "server.cfg",
  "basic.upnp": "server.cfg",
  "basic.allowedFilePatching": "server.cfg",
  "basic.maxPing": "basic.cfg",
  "basic.maxPacketLoss": "basic.cfg",
  "basic.maxDesync": "basic.cfg",
  "basic.disconnectTimeout": "server.cfg",
  "basic.callExtReportLimit": "server.cfg",
  "basic.votingTimeout": "server.cfg",
  "basic.roleTimeout": "server.cfg",
  "basic.briefingTimeout": "server.cfg",
  "basic.debriefingTimeout": "server.cfg",
  "basic.lobbyIdleTimeout": "server.cfg",
  "basic.verifySignatures": "server.cfg",
  "basic.drawingInMap": "server.cfg",
  "basic.disableVoN": "server.cfg",
  "basic.vonCodecQuality": "server.cfg",
  "basic.vonCodec": "server.cfg",
  "basic.skipLobby": "server.cfg",
  "basic.logFile": "server.cfg",
  "basic.battlEye": "server.cfg",
  "basic.timeStampFormat": "server.cfg",
  "basic.forceRotorLibSimulation": "server.cfg",
  "basic.persistent": "server.cfg",
  "basic.statisticsEnabled": "server.cfg",
  "startup.logObjectNotFound": "server.cfg",
  "startup.skipDescriptionParsing": "server.cfg",
  "startup.ignoreMissionLoadErrors": "server.cfg",
  "startup.queueSizeLogG": "server.cfg",
  "basic.maxMsgSend": "basic.cfg",
  "basic.maxSizeGuaranteed": "basic.cfg",
  "basic.maxSizeNonguaranteed": "basic.cfg",
  "basic.minBandwidth": "basic.cfg",
  "basic.maxPacketSize": "basic.cfg",
  "basic.minErrorToSend": "basic.cfg",
  "basic.minErrorToSendNear": "basic.cfg",
};

export function defaultSourceOf(path: string): DefaultSource {
  return SOURCES[path] ?? "project";
}

export function sourceLabelOf(path: string): string {
  const source = defaultSourceOf(path);
  if (source === "server.cfg-example") {
    return "Arma 3 官方 server.cfg 文档里的 Custom 难度示例值";
  }
  if (source === "basic.cfg") {
    return "Arma 3 官方 basic.cfg 参数表";
  }
  if (source === "server.cfg") {
    return "Arma 3 官方 server.cfg 文档";
  }
  return "项目内置默认值（尚未与官方文档逐条核对）";
}

/** 配置里用 0/1 表示、界面上却是开关的字段：标注要按“开/关”显示，别暴露成裸数字 */
const BOOLEAN_AS_NUMBER = new Set<string>(["basic.statisticsEnabled"]);

export function isBooleanLike(path: string): boolean {
  return BOOLEAN_AS_NUMBER.has(path);
}

export function defaultValueOf(path: string): unknown {
  const [section, key] = path.split(".");
  if (!section || !key) {
    return undefined;
  }
  return DEFAULTS[section]?.[key];
}

/** 把默认值渲染成给人看的短标签 */
export function formatDefaultValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "开" : "关";
  }
  if (value === null || value === undefined) {
    return "空";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value === "" ? "空" : value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "空" : `${value.length} 项`;
  }
  return "—";
}

export function defaultLabelOf(path: string): string {
  const value = defaultValueOf(path);
  if (isBooleanLike(path) && typeof value === "number") {
    return value !== 0 ? "开" : "关";
  }
  return formatDefaultValue(value);
}

/** 深拷贝默认值，避免把 DEFAULTS 里的数组/对象引用写进配置 */
export function cloneDefaultValue(path: string): unknown {
  const value = defaultValueOf(path);
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}
