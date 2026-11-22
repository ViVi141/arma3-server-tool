import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { ServerConfigPackage } from "../types/config.js";
import type { ModMeta } from "../types/mods.js";
import {
  buildClientModListFromMeta,
  buildDlcModList,
  buildHeadlessModListFromMeta,
  buildServerModListFromMeta,
  combineModListSegments,
  stripModParameters,
} from "../mods/mod-command-line.js";
import {
  isKnownServerExecutable,
  serverExecutableName,
} from "../platform/index.js";
import { splitCommandLine as splitCommandLineFromPlatform } from "../platform/argv.js";
import { assertSafeSubdirPath } from "../util/upload-safety.js";
import { deployHealthMod, healthModPath } from "../health/mod.js";
import { validateHealthConfig } from "../health/configuration.js";
import { maintenanceLocks } from "../maintenance/locks.js";
import { resolveEffectiveRconPort } from "./rcon-port.js";
import { writePrivateTextFile } from "../util/private-file.js";

export const CONFIG_FOLDER = "a3st_serverconfig";

export interface WriteResult {
  success: boolean;
  message: string;
  paths: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    return fallback;
  }
  return n;
}

function bool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = String(value).toLowerCase();
  if (text === "true" || text === "1") {
    return true;
  }
  if (text === "false" || text === "0") {
    return false;
  }
  return fallback;
}

function line(key: string, value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return `${key}=${value ? 1 : 0};`;
  }
  return `${key}=${value};`;
}

/**
 * Arma3 cfg 语法基于 SQF：字符串内的双引号用「重复双引号」表示（""），
 * 不能用反斜杠转义（\" 会被解析为字符串结束 + 非法 token，破坏整份 cfg）。
 */
function escapeCfgString(value: string): string {
  return value.replace(/"/g, '""');
}

function quotedLine(key: string, value: string): string {
  return `${key}="${escapeCfgString(value)}";`;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => str(v).trim()).filter(Boolean);
  }
  const text = str(value).trim();
  if (!text) {
    return [];
  }
  return text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

function writeCfgArray(key: string, items: string[]): string[] {
  if (items.length === 0) {
    return [];
  }
  const arrayKey = key.endsWith("=") ? key : `${key}=`;
  const lines: string[] = [];
  lines.push(`${arrayKey}{`);
  for (let i = 0; i < items.length; i++) {
    const item = escapeCfgString(items[i]);
    const suffix = i < items.length - 1 ? "," : "";
    lines.push(`\t"${item}"${suffix}`);
  }
  lines.push("};");
  return lines;
}

function writeCfgEvent(key: string, value: unknown): string[] {
  const text = str(value).trim();
  if (!text) {
    return [quotedLine(key, "")];
  }
  return [quotedLine(key, text)];
}

function difficultyName(level: number): string {
  if (level === 0) {
    return "Recruit";
  }
  if (level === 1) {
    return "Regular";
  }
  if (level === 2) {
    return "Veteran";
  }
  if (level === 4) {
    return "none";
  }
  return "Custom";
}

function vonCodecValue(value: unknown): number {
  if (typeof value === "number") {
    return value === 0 ? 0 : 1;
  }
  const text = str(value).trim().toLowerCase();
  if (text === "0" || text === "speex") {
    return 0;
  }
  if (text === "1" || text === "opus") {
    return 1;
  }
  return 1;
}

function timeStampFormat(value: unknown): string {
  const n = num(value, 1);
  if (n === 0) {
    return "none";
  }
  if (n === 2) {
    return "full";
  }
  return "short";
}

function appendExtraLines(content: string, extra: unknown): string {
  const text = str(extra).trim();
  if (!text) {
    return content;
  }
  const suffix = text.endsWith("\n") ? text : `${text}\n`;
  return `${content}${suffix}`;
}

export function decodeBase64Config(value: unknown): string {
  const encoded = str(value).trim();
  if (!encoded) {
    return "";
  }
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

export function isSafeStartupExtraArg(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("-") || trimmed.length > 256) {
    return false;
  }
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (/[a-zA-Z0-9]/.test(c)) {
      continue;
    }
    if ("-_=:.\\/+@ \",()[]".includes(c)) {
      continue;
    }
    return false;
  }
  return true;
}

export function appendStartupExtraArgs(parts: string[], startConfigArgs: unknown): void {
  const decoded = decodeBase64Config(startConfigArgs);
  if (!decoded) {
    return;
  }
  const lines = decoded.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !isSafeStartupExtraArg(trimmed)) {
      continue;
    }
    parts.push(trimmed);
  }
}

/** 一次性读取当前占用的 UDP 端口集合（避免逐个端口 spawn netstat/ss）。 */
function listUdpPortsInUse(): Set<number> {
  const ports = new Set<number>();
  try {
    const out = process.platform === "win32"
      ? execFileSync("netstat", ["-ano", "-p", "udp"], {
          encoding: "utf-8",
          timeout: 3000,
          stdio: ["ignore", "pipe", "ignore"],
        })
      : execFileSync("ss", ["-uln"], {
          encoding: "utf-8",
          timeout: 3000,
          stdio: ["ignore", "pipe", "ignore"],
        });
    const regex = /:(\d{1,5})(?=\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(out)) !== null) {
      const port = Number.parseInt(match[1], 10);
      if (port > 0 && port <= 65535) {
        ports.add(port);
      }
    }
  } catch {
    // 拿不到端口表时按「全部空闲」处理，由启动失败日志兜底。
  }
  return ports;
}

export function isPortInUse(port: number): boolean {
  if (port <= 0 || port > 65535) {
    return true;
  }
  return listUdpPortsInUse().has(port);
}

/**
 * 为无头客户端挑一个未占用的 UDP 端口。
 * 原实现随机取值且失败后返回已占端口，可能让 HC 与服务器或其他进程抢端口；
 * 改为从 serverPort+1 起确定性扫描，并显式排除服务器端口本身。
 */
export function pickHeadlessProtPort(serverPort: number): number {
  const used = listUdpPortsInUse();
  const base = serverPort > 0 && serverPort < 65535 ? serverPort : 2302;
  for (let offset = 1; offset <= 100; offset++) {
    const candidate = base + offset;
    if (candidate > 65535) {
      break;
    }
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function resolveMissionParamsText(
  config: ServerConfigPackage,
  template: string
): string {
  const missionParams = asRecord(config.missionParams);
  const byTemplate = asRecord(missionParams.byTemplate);
  const templateKey = template.endsWith(".pbo") ? template : `${template}.pbo`;
  const direct = str(byTemplate[template] ?? byTemplate[templateKey]).trim();
  if (direct) {
    return direct;
  }

  const flat = asRecord(missionParams.params);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined || value === null) {
      continue;
    }
    lines.push(`${key} = ${String(value)};`);
  }
  return lines.join("\n");
}

function writeMissionParamsBlock(paramsText: string): string[] {
  const trimmed = paramsText.trim();
  if (!trimmed) {
    return [];
  }
  const lines: string[] = [];
  lines.push("    class Params {");
  for (const line of trimmed.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) {
      continue;
    }
    lines.push(`      ${row}`);
  }
  lines.push("    };");
  return lines;
}

function writeMissionWhitelist(missions: unknown[]): string[] {
  const whitelist: string[] = [];
  for (const mission of missions) {
    const m = asRecord(mission);
    if (!bool(m.whiteList)) {
      continue;
    }
    const template = str(m.template).replace(/\.pbo$/i, "");
    if (template) {
      whitelist.push(template);
    }
  }
  if (whitelist.length === 0) {
    return [];
  }
  return writeCfgArray("missionWhitelist[]", whitelist);
}

/**
 * 启动前确保 -profiles 目录存在：目录不存在的，Arma 会退回文档目录，
 * 结果就是 RPT 出现在用户 Documents 下（本工具早期版本读不到的那类情况）。
 */
export function ensureProfileRoot(serverDir: string, uuid: string): string {
  const configRoot = getConfigRoot(serverDir, uuid);
  ensureDirectories(configRoot, uuid);
  return configRoot;
}

export function getConfigRoot(serverDir: string, uuid: string): string {
  return assertSafeSubdirPath(
    path.join(serverDir, CONFIG_FOLDER),
    uuid,
    "服务器 UUID"
  );
}

/**
 * Resolve server.cfg logFile to an absolute path under the profiles root.
 * Relative names like server_console.log otherwise may land outside the scanned dirs.
 */
export function resolveServerConsoleLogPath(configRoot: string, logFileSetting: string): string {
  const raw = logFileSetting.trim() || "server_console.log";
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(configRoot, raw);
}

export function serverCfgPath(serverDir: string, uuid: string): string {
  return path.join(getConfigRoot(serverDir, uuid), "server.cfg");
}

export function serverCfgExists(serverDir: string, uuid: string): boolean {
  return fs.existsSync(serverCfgPath(serverDir, uuid));
}

function ensureDirectories(configRoot: string, uuid: string): void {
  fs.mkdirSync(configRoot, { recursive: true });
  fs.mkdirSync(path.join(configRoot, "Users", uuid), { recursive: true });
  fs.mkdirSync(path.join(configRoot, "BattlEye"), { recursive: true });
}

function writeServerCfg(uuid: string, config: ServerConfigPackage, configRoot: string): string {
  const basic = asRecord(config.basic);
  const startup = asRecord(config.startup);
  const tasks = asRecord(config.tasks);
  const lines: string[] = [];

  lines.push(quotedLine("hostname", str(basic.hostname, "Arma3 Server")));
  lines.push(quotedLine("password", str(basic.password)));
  lines.push(line("maxPlayers", num(basic.maxPlayers, 64)));
  lines.push(line("persistent", bool(basic.persistent) ? 1 : 0));
  lines.push(line("skipLobby", bool(basic.skipLobby) ? 1 : 0));
  lines.push(line("drawingInMap", bool(basic.drawingInMap, true) ? 1 : 0));
  lines.push(line("statisticsEnabled", num(basic.statisticsEnabled, 1)));
  lines.push(line("forceRotorLibSimulation", num(basic.forceRotorLibSimulation, 0)));

  const forcedDifficulty = str(basic.forcedDifficulty, "none");
  if (forcedDifficulty && forcedDifficulty !== "none") {
    lines.push(quotedLine("forcedDifficulty", forcedDifficulty));
  }

  const motdItems = parseList(basic.motd);
  if (motdItems.length > 0) {
    lines.push(...writeCfgArray("motd[]", motdItems));
  } else {
    const motdText = str(basic.motd).trim();
    if (motdText) {
      lines.push(...writeCfgArray("motd[]", [motdText]));
    }
  }

  lines.push(line("motdInterval", num(basic.motdInterval, 5)));
  lines.push(line("disableVoN", bool(basic.disableVoN) ? 1 : 0));
  lines.push(line("vonCodecQuality", num(basic.vonCodecQuality, 3)));
  lines.push(line("vonCodec", vonCodecValue(basic.vonCodec)));

  const headless = parseList(basic.headlessClients);
  if (headless.length > 0) {
    lines.push(...writeCfgArray("headlessClients[]", headless));
  }

  const localClients = parseList(basic.localClient);
  if (localClients.length > 0) {
    lines.push(...writeCfgArray("LocalClient[]", localClients));
  }

  // voteThreshold 是 0..1 的比例（0.5 = 过半）；老配置里可能是百分数，做个兼容换算
  const rawThreshold = num(basic.voteThreshold, 0.5);
  const voteThreshold = rawThreshold > 1 ? Math.min(1, rawThreshold / 100) : rawThreshold;
  lines.push(line("voteThreshold", voteThreshold));

  lines.push(line("votingTimeOut", num(basic.votingTimeout, 60)));

  lines.push(line("roleTimeOut", num(basic.roleTimeout, 90)));
  lines.push(line("briefingTimeOut", num(basic.briefingTimeout, 60)));
  lines.push(line("debriefingTimeOut", num(basic.debriefingTimeout, 45)));
  lines.push(line("lobbyIdleTimeout", num(basic.lobbyIdleTimeout, 0)));

  lines.push(line("voteMissionPlayers", num(basic.voteMissionPlayers, 1)));

  lines.push(line("BattlEye", bool(basic.battlEye, true) ? 1 : 0));
  lines.push(line("verifySignatures", num(basic.verifySignatures, 2)));
  lines.push(line("kickduplicate", bool(basic.kickDuplicate) ? 1 : 0));
  lines.push(line("allowedFilePatching", num(basic.allowedFilePatching, 0)));

  const patchExceptions = parseList(basic.filePatchingExceptions);
  if (patchExceptions.length > 0) {
    lines.push(...writeCfgArray("filePatchingExceptions[]", patchExceptions));
  }

  lines.push(quotedLine("serverCommandPassword", str(basic.serverCommandPassword)));
  lines.push(quotedLine("passwordAdmin", str(basic.passwordAdmin)));

  const admins = parseList(basic.admins);
  if (admins.length > 0) {
    lines.push(...writeCfgArray("admins[]", admins));
  }

  lines.push(...writeCfgEvent("doubleIdDetected", basic.doubleIdDetected));
  lines.push(...writeCfgEvent("onUserConnected", basic.onUserConnected));
  lines.push(...writeCfgEvent("onUserDisconnected", basic.onUserDisconnected));
  lines.push(...writeCfgEvent("onHackedData", basic.onHackedData));
  lines.push(...writeCfgEvent("onDifferentData", basic.onDifferentData));
  lines.push(...writeCfgEvent("onUnsignedData", basic.onUnsignedData));
  lines.push(...writeCfgEvent("onUserKicked", basic.onUserKicked));
  lines.push(...writeCfgEvent("regularCheck", basic.regularCheck));

  lines.push(line("upnp", bool(basic.upnp) ? 1 : 0));
  lines.push(line("loopback", bool(basic.loopback) ? 1 : 0));
  lines.push(line("disconnectTimeout", num(basic.disconnectTimeout, 15)));
  lines.push(line("maxdesync", num(basic.maxDesync, -1)));
  lines.push(line("maxping", num(basic.maxPing, -1)));
  lines.push(line("maxpacketloss", num(basic.maxPacketLoss, -1)));

  const missions = Array.isArray(tasks.missions) ? tasks.missions : [];
  // 与 v1 一致：class Missions 只写当前激活任务（missions[0]），
  // 备选列表留在工具配置中供 GUI / switch_mission 使用，避免引擎轮换/投票池。
  let activeMissions: unknown[] = [];
  if (missions.length > 0) {
    activeMissions = [missions[0]];
  }
  if (activeMissions.length > 0) {
    lines.push("class Missions {");
    activeMissions.forEach((mission, index) => {
      const m = asRecord(mission);
      const template = str(m.template).replace(/\.pbo$/i, "");
      if (!template) {
        return;
      }
      lines.push(`  class Mission${index + 1} {`);
      lines.push(`    template = "${template.replace(/"/g, '\\"')}";`);
      lines.push(`    difficulty = "${difficultyName(num(m.difficulty, 3))}";`);
      lines.push(...writeMissionParamsBlock(resolveMissionParamsText(config, str(m.template))));
      lines.push("  };");
    });
    lines.push("};");
  }

  lines.push(...writeMissionWhitelist(missions));

  if (bool(tasks.autoSelectMission ?? basic.autoSelectMission)) {
    lines.push(line("autoSelectMission", true));
  }
  if (bool(tasks.randomMissionOrder ?? basic.randomMissionOrder)) {
    lines.push(line("randomMissionOrder", true));
  }

  lines.push(quotedLine("logFile", resolveServerConsoleLogPath(configRoot, str(basic.logFile, "server_console.log"))));
  lines.push(quotedLine("timeStampFormat", timeStampFormat(basic.timeStampFormat)));
  lines.push(line("callExtReportLimit", num(basic.callExtReportLimit, 1000)));

  if (
    bool(startup.logObjectNotFound)
    || bool(startup.skipDescriptionParsing)
    || bool(startup.ignoreMissionLoadErrors)
    || num(startup.queueSizeLogG, 0) > 0
  ) {
    lines.push("class AdvancedOptions {");
    lines.push(`  LogObjectNotFound=${bool(startup.logObjectNotFound, true) ? 1 : 0};`);
    lines.push(`  SkipDescriptionParsing=${bool(startup.skipDescriptionParsing) ? 1 : 0};`);
    lines.push(`  ignoreMissionLoadErrors=${bool(startup.ignoreMissionLoadErrors) ? 1 : 0};`);
    lines.push(`  queueSizeLogG=${num(startup.queueSizeLogG, 0)};`);
    lines.push("};");
  }

  let content = `${lines.join("\n")}\n`;
  content = appendExtraLines(content, basic.serverCfgArgs);

  const filePath = path.join(configRoot, "server.cfg");
  writePrivateTextFile(filePath, content);
  return filePath;
}

function writeBasicCfg(config: ServerConfigPackage, configRoot: string): string {
  const basic = asRecord(config.basic);
  const lines = [
    line("MaxMsgSend", num(basic.maxMsgSend, 128)),
    line("MaxSizeGuaranteed", num(basic.maxSizeGuaranteed, 512)),
    line("MaxSizeNonguaranteed", num(basic.maxSizeNonguaranteed, 256)),
    line("MinBandwidth", num(basic.minBandwidth, 131072)),
    line("MaxBandwidth", num(basic.maxBandwidth, 1048576)),
    line("MinErrorToSend", num(basic.minErrorToSend, 0.001)),
    line("MinErrorToSendNear", num(basic.minErrorToSendNear, 0.01)),
    line("MaxPacketSize", num(basic.maxPacketSize, 1400)),
    line("MaxCustomFileSize", num(basic.maxCustomFileSize, 0)),
  ];

  let content = `${lines.join("\n")}\n`;
  content = appendExtraLines(content, basic.basicCfgArgs);

  const filePath = path.join(configRoot, "basic.cfg");
  writePrivateTextFile(filePath, content);
  return filePath;
}

function writeProfile(uuid: string, config: ServerConfigPackage, configRoot: string): string {
  const basic = asRecord(config.basic);
  const startup = asRecord(config.startup);
  const profileDir = path.join(configRoot, "Users", uuid);
  const lines: string[] = [];

  lines.push(quotedLine("difficulty", "CustomDifficulty"));
  lines.push("class DifficultyPresets {");
  lines.push("  class CustomDifficulty {");
  lines.push("    class Options {");
  lines.push(`      groupIndicators=${num(basic.groupIndicators, 0)};
      friendlyTags=${num(basic.friendlyTags, 0)};
      enemyTags=${num(basic.enemyTags, 0)};
      detectedMines=${num(basic.detectedMines, 0)};
      commands=${num(basic.commands, 1)};
      waypoints=${num(basic.waypoints, 1)};
      tacticalPing=${num(basic.tacticalPing, 0)};
      weaponInfo=${num(basic.weaponInfo, 2)};
      stanceIndicator=${num(basic.stanceIndicator, 2)};
      staminaBar=${bool(basic.staminaBar) ? 1 : 0};
      weaponCrosshair=${bool(basic.weaponCrosshair) ? 1 : 0};
      visionAid=${bool(basic.visionAid) ? 1 : 0};
      thirdPersonView=${num(basic.thirdPerson, 0)};
      cameraShake=${bool(basic.cameraShake, true) ? 1 : 0};
      scoreTable=${bool(basic.scoreTable, true) ? 1 : 0};
      deathMessages=${bool(basic.deathMessages, true) ? 1 : 0};
      vonID=${bool(basic.vonId, true) ? 1 : 0};
      mapContent=${bool(basic.mapContent) ? 1 : 0};
      mapContentFriendly=${bool(basic.mapContentFriendly, true) ? 1 : 0};
      mapContentEnemy=${bool(basic.mapContentEnemy) ? 1 : 0};
      mapContentMines=${bool(basic.mapContentMines) ? 1 : 0};
      reducedDamage=${bool(basic.reducedDamage) ? 1 : 0};
      autoReport=${bool(basic.autoReport) ? 1 : 0};
      multipleSaves=${bool(basic.multipleSaves) ? 1 : 0};`);
  lines.push("    };");
  lines.push('    description="Arma3 Server Tools CustomDifficulty";');
  lines.push("    aiLevelPreset=3;");
  lines.push("  };");
  lines.push("  class CustomAILevel {");
  lines.push(`    skillAI=${num(basic.skillAi, 0.5)};`);
  lines.push(`    precisionAI=${num(basic.precisionAi, 0.5)};`);
  lines.push("  };");
  lines.push("};");
  lines.push(line("TerrainGrid", num(startup.terrainGrid, 25)));
  lines.push(line("ViewDistance", num(startup.viewDistance, 1600)));

  let content = `${lines.join("\n")}\n`;
  content = appendExtraLines(content, basic.profileArgs);

  const filePath = path.join(profileDir, `${uuid}.Arma3Profile`);
  writePrivateTextFile(filePath, content);
  return filePath;
}

/** BattlEye runtime files the game loads from its -bepath directory. */
const BE_RUNTIME_FILES = [
  "BEServer_x64.dll",
  "BEServer.dll",
  "beserver_x64.dll",
  "beserver.dll",
  // Linux dedicated server ships shared objects (case-sensitive paths).
  "beserver_x64.so",
  "beserver.so",
  "BEServer_x64.so",
  "BEServer.so",
];

/**
 * Config basenames BattlEye looks for before renaming to `*_active_<id>.cfg`.
 * Windows is case-insensitive; Linux is not and typically loads the lowercase
 * `beserver_x64.cfg` next to `beserver_x64.so`. Write both casings.
 */
const BE_CFG_BASENAMES = [
  "BEServer_x64.cfg",
  "BEServer.cfg",
  "beserver_x64.cfg",
  "beserver.cfg",
];

/**
 * Copy the BE runtime from the game install into the per-server BE directory
 * (referenced via -bepath) so multiple instances get isolated RCon configs.
 * Missing runtime files are not fatal: the cfg is still written.
 */
function copyBattlEyeRuntime(serverDir: string, beDir: string): void {
  // Linux installs may use a lowercase "battleye" folder.
  const sourceDir = [path.join(serverDir, "BattlEye"), path.join(serverDir, "battleye")].find(
    (dir) => fs.existsSync(dir)
  );
  if (!sourceDir || path.resolve(sourceDir) === path.resolve(beDir)) {
    return;
  }
  for (const name of BE_RUNTIME_FILES) {
    const source = path.join(sourceDir, name);
    const target = path.join(beDir, name);
    try {
      // Always mirror the current game version so the BE server matches the client.
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, target);
      }
    } catch {
      // Ignore: BE falls back to the game directory when the copy fails.
    }
  }
  const bans = path.join(sourceDir, "bans.txt");
  const bansTarget = path.join(beDir, "bans.txt");
  try {
    if (fs.existsSync(bans) && !fs.existsSync(bansTarget)) {
      fs.copyFileSync(bans, bansTarget);
    }
  } catch {
    // Ignore: BE creates bans.txt on first launch.
  }
}

/** Drop stale `*_active_*.cfg` so the next launch re-reads updated RCon settings. */
function clearActiveBattlEyeConfigs(beDir: string): void {
  if (!fs.existsSync(beDir)) {
    return;
  }
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(beDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!/^beserver(_x64)?_active_/i.test(name) || !name.toLowerCase().endsWith(".cfg")) {
      continue;
    }
    try {
      fs.unlinkSync(path.join(beDir, name));
    } catch {
      // Ignore: an in-use active cfg is rewritten on the next clean stop/start.
    }
  }
}

function writeBattlEyeCfg(config: ServerConfigPackage, configRoot: string): string[] {
  const battleye = asRecord(config.battleye);
  const basic = asRecord(config.basic);
  const serverDir = str(config.server?.serverDir).trim();
  // BattlEye requires RConPort to differ from game / Steam / BE traffic ports.
  const rconPort = resolveEffectiveRconPort(config);
  const lines = [
    `RConPassword ${str(battleye.rconPassword)}`,
    `RConPort ${rconPort}`,
  ];

  const maxCreateVehicleCount = num(basic.maxCreateVehicleCount, 0);
  const maxCreateVehicleSeconds = num(basic.maxCreateVehicleSeconds, 0);
  if (maxCreateVehicleCount !== 0 && maxCreateVehicleSeconds !== 0) {
    lines.push(`MaxCreateVehiclePerInterval ${maxCreateVehicleCount} ${maxCreateVehicleSeconds}`);
  }

  const maxSetPosCount = num(basic.maxSetPosCount, 0);
  const maxSetPosSeconds = num(basic.maxSetPosSeconds, 0);
  if (maxSetPosCount !== 0 && maxSetPosSeconds !== 0) {
    lines.push(`MaxSetPosPerInterval ${maxSetPosCount} ${maxSetPosSeconds}`);
  }

  const content = `${lines.join("\n")}\n`;
  const beDir = path.join(configRoot, "BattlEye");
  fs.mkdirSync(beDir, { recursive: true });
  clearActiveBattlEyeConfigs(beDir);
  const paths = BE_CFG_BASENAMES.map((name) => path.join(beDir, name));

  for (const filePath of paths) {
    writePrivateTextFile(filePath, content);
  }

  if (serverDir) {
    copyBattlEyeRuntime(serverDir, beDir);
  }

  return paths;
}

/**
 * Refresh only the BattlEye files (BEServer*.cfg + runtime copy). Called on
 * start so -bepath always points at a complete, current config even when the
 * user changed the RCon password/port without re-writing the game config.
 */
export function ensureBattlEyeFiles(uuid: string, config: ServerConfigPackage): WriteResult {
  const serverDir = str(config.server?.serverDir).trim();
  if (!serverDir) {
    return { success: false, message: "未设置服务器目录", paths: [] };
  }
  if (!uuid) {
    return { success: false, message: "缺少服务器 UUID", paths: [] };
  }

  try {
    const configRoot = getConfigRoot(serverDir, uuid);
    ensureDirectories(configRoot, uuid);
    const paths = writeBattlEyeCfg(config, configRoot);
    return { success: true, message: "BattlEye 配置已写入", paths };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BattlEye 配置写入失败";
    return { success: false, message, paths: [] };
  }
}

export function writeAll(uuid: string, config: ServerConfigPackage): WriteResult {
  const serverDir = str(config.server?.serverDir).trim();
  if (!serverDir) {
    return { success: false, message: "未设置服务器目录", paths: [] };
  }
  if (!uuid) {
    return { success: false, message: "缺少服务器 UUID", paths: [] };
  }

  try {
    maintenanceLocks.assertAvailable({ instances: [uuid], paths: [{ path: getConfigRoot(serverDir, uuid), mode: "write" }] });
    validateHealthConfig(config);
    const configRoot = getConfigRoot(serverDir, uuid);
    ensureDirectories(configRoot, uuid);

    const paths = [
      ...(config.health?.enabled === true ? [deployHealthMod(configRoot)] : []),
      writeServerCfg(uuid, config, configRoot),
      writeBasicCfg(config, configRoot),
      writeProfile(uuid, config, configRoot),
      ...writeBattlEyeCfg(config, configRoot),
    ];

    return {
      success: true,
      message: "server.cfg、basic.cfg、Profile 与 BattlEye 配置已写入",
      paths,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "写入失败";
    return { success: false, message, paths: [] };
  }
}

export function splitCommandLine(line: string): string[] {
  return splitCommandLineFromPlatform(line);
}

export function buildStartCommandLine(
  uuid: string,
  config: ServerConfigPackage,
  mods: ModMeta[] = []
): string {
  const startup = asRecord(config.startup);
  const basic = asRecord(config.basic);
  const monitoring = asRecord(config.monitoring);
  const serverDir = str(config.server?.serverDir).trim();
  const configRoot = getConfigRoot(serverDir, uuid);
  const parts: string[] = [];

  if (bool(startup.autoInit)) {
    parts.push("-autoInit");
  }

  if (bool(startup.filePatching)) {
    parts.push("-filePatching");
  }

  const pidFile = str(basic.pidFile).trim();
  if (pidFile) {
    parts.push(`-pid=${pidFile}`);
  }

  const rankingFile = str(basic.rankingFile).trim();
  if (rankingFile) {
    parts.push(`-ranking=${rankingFile}`);
  }

  parts.push(`-port=${num(startup.port, 2302)}`);

  if (bool(basic.bandwidthAlg)) {
    parts.push("-bandwidthAlg=2");
  }
  if (bool(startup.enableHT, true)) {
    parts.push("-enableHT");
  }
  if (bool(startup.hugepages)) {
    parts.push("-hugepages");
  }
  if (bool(startup.loadMissionToMemory, true)) {
    parts.push("-loadMissionToMemory");
  }
  if (bool(startup.disableServerThread)) {
    parts.push("-disableServerThread");
  }

  const cpuCount = num(startup.cpuCount, 0);
  if (cpuCount > 0) {
    parts.push(`-cpuCount=${cpuCount}`);
  }

  const exThreads = num(startup.exThreads, 0);
  if (exThreads > 0) {
    parts.push(`-exThreads=${exThreads}`);
  }

  const maxMem = num(startup.maxMem, 0);
  if (maxMem > 0) {
    parts.push(`-maxMem=${maxMem}`);
  }

  parts.push(`-limitFPS=${num(startup.limitFps, 60)}`);

  if (bool(basic.noLogs)) {
    parts.push("-noLogs");
  }
  if (bool(basic.netLog)) {
    parts.push("-netlog");
  }

  parts.push(`"-config=${path.join(configRoot, "server.cfg")}"`);
  parts.push(`"-cfg=${path.join(configRoot, "basic.cfg")}"`);
  parts.push(`"-profiles=${configRoot}"`);
  parts.push(`"-name=${uuid}"`);

  // Point BattlEye at the per-instance directory that holds the generated
  // BEServer*.cfg. Without this the game reads <serverDir>/BattlEye and the
  // configured RCon password/port are silently ignored.
  if (bool(basic.battlEye, true)) {
    parts.push(`"-bepath=${path.join(configRoot, "BattlEye")}"`);
  }

  const dlcMods = buildDlcModList(startup);
  const userClientMods = buildClientModListFromMeta(serverDir, mods);
  const clientModList = combineModListSegments(dlcMods, userClientMods);
  const includeMonitoring = bool(monitoring.enabled) || bool(monitoring.modEnabled);
  const serverModList = combineModListSegments(
    buildServerModListFromMeta(serverDir, mods, includeMonitoring),
    config.health?.enabled === true ? healthModPath(configRoot) : ""
  );

  parts.push(`"-mod=${clientModList}"`);
  parts.push(`"-serverMod=${serverModList}"`);

  const extraParams = stripModParameters(str(startup.parameters).trim());
  if (extraParams) {
    parts.push(...splitCommandLine(extraParams));
  }

  const startArgs = str(startup.startArgs).trim();
  if (startArgs) {
    parts.push(...splitCommandLine(startArgs));
  }

  appendStartupExtraArgs(parts, startup.startConfigArgs);

  return parts.join(" ");
}

export function buildHeadlessClientCommandLine(
  uuid: string,
  config: ServerConfigPackage,
  mods: ModMeta[] = []
): string {
  const basic = asRecord(config.basic);
  const startup = asRecord(config.startup);
  const serverDir = str(config.server?.serverDir).trim();
  const configRoot = getConfigRoot(serverDir, uuid);
  const parts: string[] = [];

  const password = str(basic.password).trim();
  if (password) {
    parts.push(`-password=${password}`);
  }

  const serverPort = num(startup.port, num(basic.port, 2302));
  const hcPort = pickHeadlessProtPort(serverPort);
  parts.push("-limitFPS=1000");
  parts.push("-client");
  parts.push(`-connect=127.0.0.1:${serverPort}`);
  if (hcPort > 0) {
    // 无可用端口时不传 -prot，交给游戏选择默认端口，避免显式传入 0。
    parts.push(`-prot=${hcPort}`);
  }
  // HC 的 RPT 不得与服务器心跳争抢同一个 profile。
  const headlessRoot = path.join(configRoot, "headless");
  parts.push(`"-profiles=${headlessRoot}"`);
  parts.push(`"-name=${uuid}_hc"`);

  const headlessModList = buildHeadlessModListFromMeta(serverDir, mods);
  parts.push(`"-mod=${headlessModList}"`);
  parts.push("-noPause");
  parts.push("-noSound");

  return parts.join(" ");
}

export function getServerExecutablePath(config: ServerConfigPackage): string {
  const serverDir = str(config.server?.serverDir).trim();
  const x64 = config.server?.x64 !== false;
  const executable = str(config.server?.executable, "").trim();
  if (path.isAbsolute(executable)) {
    return executable;
  }
  const fileName =
    executable && !isKnownServerExecutable(executable)
      ? executable
      : serverExecutableName(x64);
  return path.join(serverDir, fileName);
}
