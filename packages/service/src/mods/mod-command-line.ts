import * as fs from "node:fs";
import * as path from "node:path";
import type { ModMeta } from "../types/mods.js";

export interface ModPathRef {
  modPath: string;
  modDirName: string;
}

export function formatModParameter(serverDir: string, modPath: string, modDirName: string): string {
  if (modPath.trim()) {
    const trimmed = modPath.trim().replace(/[/\\]+$/, "");
    if (trimmed.startsWith("@")) {
      return trimmed;
    }

    const token = tryFormatAsServerRelativeToken(serverDir, trimmed);
    if (token) {
      return token;
    }

    return trimmed;
  }

  if (!modDirName.trim() || !serverDir.trim()) {
    return "";
  }

  let folderName = modDirName.trim().replace(/[/\\]+$/, "");
  if (folderName.startsWith("@")) {
    folderName = folderName.slice(1);
  }
  if (!folderName) {
    return "";
  }

  const serverModFolder = path.join(serverDir, folderName);
  if (!fs.existsSync(serverModFolder)) {
    return "";
  }

  return `@${folderName}`;
}

export function isModParameterAvailable(serverDir: string, formattedParameter: string): boolean {
  if (!formattedParameter.trim()) {
    return false;
  }
  if (formattedParameter.startsWith("@")) {
    return true;
  }
  return fs.existsSync(formattedParameter);
}

export function buildModList(
  serverDir: string,
  refs: ModPathRef[],
  verifyModPaths = true
): string {
  const entries = new Set<string>();
  const parts: string[] = [];

  for (const ref of refs) {
    const formatted = formatModParameter(serverDir, ref.modPath, ref.modDirName);
    if (!formatted) {
      continue;
    }
    if (verifyModPaths && !isModParameterAvailable(serverDir, formatted)) {
      continue;
    }
    const key = formatted.toLowerCase();
    if (entries.has(key)) {
      continue;
    }
    entries.add(key);
    parts.push(formatted);
  }

  return parts.join(";");
}

export function buildClientModListFromMeta(serverDir: string, mods: ModMeta[]): string {
  const refs: ModPathRef[] = [];
  for (const mod of mods) {
    if (!mod.enabled) {
      continue;
    }
    if (mod.isClientMod || mod.isHcMod) {
      refs.push({ modPath: mod.path, modDirName: mod.dirName });
    }
  }
  return buildModList(serverDir, refs, false);
}

export function buildHeadlessModListFromMeta(serverDir: string, mods: ModMeta[]): string {
  const refs: ModPathRef[] = [];
  for (const mod of mods) {
    if (!mod.enabled) {
      continue;
    }
    if (mod.isHcMod) {
      refs.push({ modPath: mod.path, modDirName: mod.dirName });
    }
  }
  return buildModList(serverDir, refs, false);
}

export function buildServerModListFromMeta(
  serverDir: string,
  mods: ModMeta[],
  includeMonitoringMod = false
): string {
  const refs: ModPathRef[] = [];
  for (const mod of mods) {
    if (!mod.enabled) {
      continue;
    }
    if (mod.isServerMod) {
      refs.push({ modPath: mod.path, modDirName: mod.dirName });
    }
  }
  if (includeMonitoringMod) {
    refs.push({ modPath: "@a3st_monitor", modDirName: "" });
  }
  return buildModList(serverDir, refs, false);
}

export function buildDlcModList(startup: Record<string, unknown>): string {
  const segments: string[] = [];
  if (bool(startup.dlcWs)) {
    segments.push("WS");
  }
  if (bool(startup.dlcVn)) {
    segments.push("VN");
  }
  if (bool(startup.dlcCsla)) {
    segments.push("CSLA");
  }
  if (bool(startup.dlcGm)) {
    segments.push("GM");
  }
  if (bool(startup.dlcContact)) {
    segments.push("contact");
  }
  return segments.join(";");
}

function bool(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
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
  return false;
}

export function combineModListSegments(firstSegment: string, secondSegment: string): string {
  if (!firstSegment) {
    return secondSegment;
  }
  if (!secondSegment) {
    return firstSegment;
  }
  return `${firstSegment};${secondSegment}`;
}

export function stripModParameters(params: string): string {
  return params
    .replace(/-mod=(?:"[^"]*"|[^\s]+)/g, "")
    .replace(/-serverMod=(?:"[^"]*"|[^\s]+)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tryFormatAsServerRelativeToken(serverDir: string, fullPath: string): string {
  try {
    const normalizedServerDir = fs.realpathSync(serverDir).replace(/[/\\]+$/, "");
    const normalizedModPath = fs.realpathSync(fullPath).replace(/[/\\]+$/, "");

    const serverPrefix = normalizedServerDir + path.sep;
    if (!normalizedModPath.toLowerCase().startsWith(serverPrefix.toLowerCase())) {
      return "";
    }

    const relative = normalizedModPath.slice(serverPrefix.length);
    const segments = relative.split(/[/\\]/).filter(Boolean);
    if (!segments.length) {
      return "";
    }

    let folderName = segments[0];
    if (folderName.startsWith("@")) {
      return folderName;
    }
    return `@${folderName}`;
  } catch {
    return "";
  }
}
