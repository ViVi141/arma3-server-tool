import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
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

function quotedLine(key: string, value: string): string {
  return `${key}="${value.replace(/"/g, '\\"')}";`;
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
    const item = items[i].replace(/"/g, '\\"');
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

export function isPortInUse(port: number): boolean {
  if (port <= 0 || port > 65535) {
    return true;
  }
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano -p udp", {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pattern = new RegExp(`:${port}\\s`);
      return pattern.test(out);
    }
    const out = execSync("ss -uln", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.includes(`:${port} `);
  } catch {
    return false;
  }
}

export function pickHeadlessProtPort(serverPort: number): number {
  let hcPort = serverPort + 5;
  for (let i = 0; i < 10; i++) {
    hcPort = Math.floor(Math.random() * 100) + serverPort;
    if (!isPortInUse(hcPort)) {
      return hcPort;
    }
  }
  return hcPort;
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

export function getConfigRoot(serverDir: string, uuid: string): string {
  return path.join(serverDir, CONFIG_FOLDER, uuid);
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
  lines.push(line("persistent", bool(basic.persistent, true) ? 1 : 0));
  lines.push(line("skipLobby", bool(basic.skipLobby).toString()));
  lines.push(line("drawingInMap", bool(basic.drawingInMap, true).toString()));
  lines.push(line("statisticsEnabled", num(basic.statisticsEnabled, 0)));
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

  lines.push(line("motdInterval", num(basic.motdInterval, 30)));
  lines.push(line("disableVoN", bool(basic.disableVoN) ? 1 : 0));
  lines.push(line("vonCodecQuality", num(basic.vonCodecQuality, 8)));
  lines.push(line("vonCodec", str(basic.vonCodec, "SPEEX")));

  const headless = parseList(basic.headlessClients);
  if (headless.length > 0) {
    lines.push(...writeCfgArray("headlessClients[]", headless));
  }

  const localClients = parseList(basic.localClient);
  if (localClients.length > 0) {
    lines.push(...writeCfgArray("LocalClient[]", localClients));
  }

  const voteThreshold = num(basic.voteThreshold, 0);
  if (voteThreshold !== 0) {
    lines.push(line("voteThreshold", voteThreshold));
  }

  const votingTimeout = num(basic.votingTimeout, 0);
  if (votingTimeout !== 0) {
    lines.push(line("votingTimeOut", votingTimeout));
  }

  lines.push(line("roleTimeOut", num(basic.roleTimeout, 0)));
  lines.push(line("briefingTimeOut", num(basic.briefingTimeout, 0)));
  lines.push(line("debriefingTimeOut", num(basic.debriefingTimeout, 0)));
  lines.push(line("lobbyIdleTimeout", num(basic.lobbyIdleTimeout, 0)));

  const voteMissionPlayers = num(basic.voteMissionPlayers, 0);
  if (voteMissionPlayers !== 0) {
    lines.push(line("voteMissionPlayers", voteMissionPlayers));
  }

  lines.push(line("BattlEye", bool(basic.battlEye, true) ? 1 : 0));
  lines.push(line("verifySignatures", num(basic.verifySignatures, 2)));
  lines.push(line("kickduplicate", bool(basic.kickDuplicate, true) ? 1 : 0));
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

  lines.push(line("upnp", bool(basic.upnp).toString()));
  lines.push(line("loopback", bool(basic.loopback).toString()));
  lines.push(line("disconnectTimeout", num(basic.disconnectTimeout, 90)));
  lines.push(line("maxdesync", num(basic.maxDesync, 150)));
  lines.push(line("maxping", num(basic.maxPing, 200)));
  lines.push(line("maxpacketloss", num(basic.maxPacketLoss, 0)));

  const missions = Array.isArray(tasks.missions) ? tasks.missions : [];
  if (missions.length > 0) {
    lines.push("class Missions {");
    missions.forEach((mission, index) => {
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

  lines.push(quotedLine("logFile", str(basic.logFile, "server_console.log")));
  lines.push(quotedLine("timeStampFormat", timeStampFormat(basic.timeStampFormat)));
  lines.push(line("callExtReportLimit", num(basic.callExtReportLimit, 10000)));

  if (
    bool(startup.logObjectNotFound)
    || bool(startup.skipDescriptionParsing)
    || bool(startup.ignoreMissionLoadErrors, true)
    || num(startup.queueSizeLogG, 0) > 0
  ) {
    lines.push("class AdvancedOptions {");
    lines.push(`  LogObjectNotFound=${bool(startup.logObjectNotFound).toString()};`);
    lines.push(`  SkipDescriptionParsing=${bool(startup.skipDescriptionParsing).toString()};`);
    lines.push(`  ignoreMissionLoadErrors=${bool(startup.ignoreMissionLoadErrors, true).toString()};`);
    lines.push(`  queueSizeLogG=${num(startup.queueSizeLogG, 1000000)};`);
    lines.push("};");
  }

  let content = `${lines.join("\n")}\n`;
  content = appendExtraLines(content, basic.serverCfgArgs);

  const filePath = path.join(configRoot, "server.cfg");
  fs.writeFileSync(filePath, content, "utf-8");
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
  fs.writeFileSync(filePath, content, "utf-8");
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
  lines.push(`      groupIndicators=${num(basic.groupIndicators, 2)};`);
  lines.push(`      friendlyTags=${num(basic.friendlyTags, 2)};`);
  lines.push(`      enemyTags=${num(basic.enemyTags, 0)};`);
  lines.push(`      detectedMines=${num(basic.detectedMines, 2)};`);
  lines.push(`      commands=${num(basic.commands, 2)};`);
  lines.push(`      waypoints=${num(basic.waypoints, 2)};`);
  lines.push(`      tacticalPing=${num(basic.tacticalPing, 2)};`);
  lines.push(`      weaponInfo=${num(basic.weaponInfo, 2)};`);
  lines.push(`      stanceIndicator=${num(basic.stanceIndicator, 2)};`);
  lines.push(`      staminaBar=${bool(basic.staminaBar, true)};`);
  lines.push(`      weaponCrosshair=${bool(basic.weaponCrosshair, true)};`);
  lines.push(`      visionAid=${bool(basic.visionAid)};`);
  lines.push(`      thirdPersonView=${num(basic.thirdPerson, 1)};`);
  lines.push(`      cameraShake=${bool(basic.cameraShake, true)};`);
  lines.push(`      scoreTable=${bool(basic.scoreTable, true)};`);
  lines.push(`      deathMessages=${bool(basic.deathMessages, true)};`);
  lines.push(`      vonID=${bool(basic.vonId, true)};`);
  lines.push(`      mapContent=${bool(basic.mapContent, true)};`);
  lines.push(`      mapContentFriendly=${bool(basic.mapContentFriendly, true)};`);
  lines.push(`      mapContentEnemy=${bool(basic.mapContentEnemy)};`);
  lines.push(`      mapContentMines=${bool(basic.mapContentMines)};`);
  lines.push(`      reducedDamage=${bool(basic.reducedDamage)};`);
  lines.push(`      autoReport=${bool(basic.autoReport)};`);
  lines.push(`      multipleSaves=${bool(basic.multipleSaves, true)};`);
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
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function writeBattlEyeCfg(config: ServerConfigPackage, configRoot: string): string[] {
  const battleye = asRecord(config.battleye);
  const basic = asRecord(config.basic);
  const lines = [
    `RConPassword ${str(battleye.rconPassword)}`,
    `RConPort ${num(battleye.rconPort, num(basic.port, 2302))}`,
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
  const paths = [
    path.join(beDir, "BEServer_x64.cfg"),
    path.join(beDir, "BEServer.cfg"),
  ];

  for (const filePath of paths) {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  return paths;
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
    const configRoot = getConfigRoot(serverDir, uuid);
    ensureDirectories(configRoot, uuid);

    const paths = [
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
  const args: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === " " && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
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

  const dlcMods = buildDlcModList(startup);
  const userClientMods = buildClientModListFromMeta(serverDir, mods);
  const clientModList = combineModListSegments(dlcMods, userClientMods);
  const includeMonitoring = bool(monitoring.enabled) || bool(monitoring.modEnabled);
  const serverModList = buildServerModListFromMeta(serverDir, mods, includeMonitoring);

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
  parts.push(`-prot=${hcPort}`);
  parts.push(`"-profiles=${configRoot}"`);
  parts.push(`"-name=${uuid}"`);

  const headlessModList = buildHeadlessModListFromMeta(serverDir, mods);
  parts.push(`"-mod=${headlessModList}"`);
  parts.push("-noPause");
  parts.push("-noSound");

  return parts.join(" ");
}

export function getServerExecutablePath(config: ServerConfigPackage): string {
  const serverDir = str(config.server?.serverDir).trim();
  const executable = str(config.server?.executable, "arma3server_x64.exe");
  if (path.isAbsolute(executable)) {
    return executable;
  }
  return path.join(serverDir, executable);
}
