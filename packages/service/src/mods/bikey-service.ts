import * as fs from "node:fs";
import * as path from "node:path";
import { maintenanceLocks } from "../maintenance/locks.js";
import type { ModBikeyStatus, ModSignatureEvidence } from "../types/mods.js";

export interface ModBikeyFile {
  fullPath: string;
  name: string;
}

export interface ModBikeyInspectionResult {
  hasBisign: boolean;
  hasBikeyInMod: boolean;
  allCopiedToServer: boolean;
  status: ModBikeyStatus;
  label: string;
  evidence?: ModSignatureEvidence;
}

export const MOD_BIKEY_STATUS_LABELS: Record<ModBikeyStatus, string> = {
  unsigned: "未发现签名",
  partial: "部分 PBO 缺签名",
  no_key: "缺少公钥",
  not_copied: "公钥未部署",
  key_mismatch: "公钥内容不一致",
  ready: "文件检查就绪",
  unknown: "未检查",
  read_error: "读取失败",
};

/** 保留旧接口名称；仅表示文件检查就绪，不进行密码学验证。 */
export function isModBikeyValidationPassed(status: ModBikeyStatus | undefined): boolean {
  return status === "ready";
}

export function isModBikeyInspectionValid(result: ModBikeyInspectionResult): boolean {
  return result.status === "ready" && result.hasBisign && result.hasBikeyInMod && result.allCopiedToServer;
}

export function getServerKeysDirectory(serverDir: string): string {
  return path.join(serverDir, "Keys");
}

export function normalizeBikeyToken(value: string): string {
  return value.replace(/ /g, "_").replace(/@/g, "");
}

/** 保留旧版生成的部署文件名。 */
export function getCopiedBikeyFileName(modDirName: string, bikey: ModBikeyFile): string {
  const safeDirName = normalizeBikeyToken(modDirName);
  const safeName = normalizeBikeyToken(bikey.name).replace(/bikey/gi, "").replace(/\./g, "");
  return `${safeDirName}-${safeName}${path.extname(bikey.name)}`;
}

export function getCopiedBikeyPath(serverKeysDirectory: string, modDirName: string, bikey: ModBikeyFile): string {
  return path.join(serverKeysDirectory, getCopiedBikeyFileName(modDirName, bikey));
}

function pathIdentity(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function resolveModKeysDirectories(modPath: string): string[] {
  const seen = new Set<string>();
  return ["keys", "Keys"].map((name) => path.join(modPath, name)).filter((dir) => {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    const identity = pathIdentity(fs.realpathSync(dir));
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? "READ_FAILED";
}

/** 同一次遍历收集证据；realpath 去重避免符号链接环，错误不能伪装成缺签名。 */
function collectFiles(modPath: string): { files: string[]; errors: string[] } {
  const files: string[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  function visit(directory: string): void {
    try {
      const identity = pathIdentity(fs.realpathSync(directory));
      if (visited.has(identity)) return;
      visited.add(identity);
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        try {
          const stat = entry.isSymbolicLink() ? fs.statSync(fullPath) : entry;
          if (stat.isDirectory()) visit(fullPath);
          else if (stat.isFile()) files.push(fullPath);
        } catch (error) {
          errors.push(`${path.relative(modPath, fullPath)}: ${errorCode(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${path.relative(modPath, directory) || "."}: ${errorCode(error)}`);
    }
  }
  if (!modPath) errors.push("模组路径为空");
  else visit(modPath);
  return { files: files.sort(), errors };
}

export function findModBikeys(modPath: string): ModBikeyFile[] {
  const scan = collectFiles(modPath);
  if (scan.errors.length) throw new Error(scan.errors.join("；"));
  return scan.files.filter((file) => /\.bikey$/i.test(file)).map((fullPath) => ({ fullPath, name: path.basename(fullPath) }));
}

export function hasBisignFiles(modPath: string): boolean {
  const scan = collectFiles(modPath);
  if (scan.errors.length) throw new Error(scan.errors.join("；"));
  return scan.files.some((file) => /\.bisign$/i.test(file));
}

type KeyState = "matching" | "missing" | "mismatch";
function deployedKeyState(keysDirectory: string, modDirName: string, bikey: ModBikeyFile): KeyState {
  const source = fs.readFileSync(bikey.fullPath);
  if (!source.length) throw new Error("公钥文件为空");
  const candidates = new Set([getCopiedBikeyPath(keysDirectory, modDirName, bikey), path.join(keysDirectory, bikey.name)]);
  let found = false;
  let matching = false;
  for (const candidate of candidates) {
    try {
      const deployed = fs.readFileSync(candidate);
      found = true;
      if (source.equals(deployed)) matching = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return matching ? "matching" : found ? "mismatch" : "missing";
}

export function isBikeyPresentOnServer(serverKeysDirectory: string, modDirName: string, bikey: ModBikeyFile): boolean {
  return deployedKeyState(serverKeysDirectory, modDirName, bikey) === "matching";
}

export function areAllModBikeysOnServer(serverKeysDirectory: string, modDirName: string, modBikeys: ModBikeyFile[]): boolean {
  return modBikeys.length > 0 && modBikeys.every((key) => isBikeyPresentOnServer(serverKeysDirectory, modDirName, key));
}

/** 兼容旧调用者的公钥检查；PBO 覆盖证据由 inspectMod 提供。 */
export function resolveModBikeyStatus(hasBisign: boolean, modBikeys: ModBikeyFile[], modDirName: string, serverDir?: string): ModBikeyInspectionResult {
  let status: ModBikeyStatus = !hasBisign ? "unsigned" : !modBikeys.length ? "no_key" : "not_copied";
  if (hasBisign && modBikeys.length && serverDir?.trim()) {
    try {
      const states = modBikeys.map((key) => deployedKeyState(getServerKeysDirectory(serverDir), modDirName, key));
      if (states.every((state) => state === "matching")) status = "ready";
      else if (states.includes("mismatch")) status = "key_mismatch";
    } catch {
      status = "read_error";
    }
  }
  return { hasBisign, hasBikeyInMod: modBikeys.length > 0, allCopiedToServer: status === "ready", status, label: MOD_BIKEY_STATUS_LABELS[status] };
}

export function inspectMod(modPath: string, modDirName: string, serverDir?: string): ModBikeyInspectionResult {
  const scan = collectFiles(modPath);
  const pbos = scan.files.filter((file) => /\.pbo$/i.test(file));
  const signs = scan.files.filter((file) => /\.bisign$/i.test(file));
  const keys = scan.files.filter((file) => /\.bikey$/i.test(file));
  const evidence: ModSignatureEvidence = {
    checkedAt: new Date().toISOString(), pboCount: pbos.length, signedPboCount: 0,
    missingPbos: [], keyCount: keys.length, deployedKeyCount: 0,
    missingKeys: [], mismatchedKeys: [], readErrors: scan.errors,
    canDeployKeys: false, reason: "", cryptographicVerified: false,
  };
  for (const pbo of pbos) {
    const identity = pathIdentity(pbo);
    // 接受 foo.pbo.bisign 及 foo.pbo.author.bisign，仅匹配同目录完整 PBO 名。
    const covered = signs.some((sign) => {
      const candidate = pathIdentity(sign);
      return candidate.startsWith(`${identity}.`) && candidate.endsWith(".bisign");
    });
    if (covered) evidence.signedPboCount++;
    else evidence.missingPbos.push(path.relative(modPath, pbo));
  }
  const destinations = new Map<string, Buffer>();
  for (const fullPath of keys) {
    const key = { fullPath, name: path.basename(fullPath) };
    const relative = path.relative(modPath, fullPath);
    try {
      const content = fs.readFileSync(fullPath);
      if (!content.length) throw new Error("公钥文件为空");
      const destination = pathIdentity(getCopiedBikeyFileName(modDirName, key));
      const previous = destinations.get(destination);
      if (previous && !previous.equals(content)) {
        evidence.readErrors.push(`${relative}: 不同公钥映射到同一部署文件名，需人工处理`);
        continue;
      }
      destinations.set(destination, content);
      const state = serverDir?.trim() ? deployedKeyState(getServerKeysDirectory(serverDir), modDirName, key) : "missing";
      if (state === "matching") evidence.deployedKeyCount++;
      else if (state === "mismatch") evidence.mismatchedKeys.push(relative);
      else evidence.missingKeys.push(relative);
    } catch (error) {
      evidence.readErrors.push(`${relative}: ${errorCode(error)}`);
    }
  }
  let status: ModBikeyStatus;
  if (evidence.readErrors.length) status = "read_error";
  else if (!pbos.length) status = "unknown";
  else if (!evidence.signedPboCount) status = "unsigned";
  else if (evidence.missingPbos.length) status = "partial";
  else if (!keys.length) status = "no_key";
  else if (evidence.mismatchedKeys.length) status = "key_mismatch";
  else if (evidence.missingKeys.length) status = "not_copied";
  else status = "ready";
  evidence.canDeployKeys = !!serverDir?.trim() && (status === "not_copied" || status === "key_mismatch");
  evidence.reason = status === "read_error" ? `读取不完整：${evidence.readErrors.join("；")}`
    : !pbos.length ? "未发现 PBO，无法确认签名覆盖，请检查模组目录"
    : `PBO 签名文件覆盖 ${evidence.signedPboCount}/${pbos.length}；公钥内容匹配 ${evidence.deployedKeyCount}/${keys.length}`;
  if (evidence.missingPbos.length) evidence.reason += `；缺签名：${evidence.missingPbos.join("、")}`;
  if (evidence.missingKeys.length) evidence.reason += `；未部署：${evidence.missingKeys.join("、")}`;
  if (evidence.mismatchedKeys.length) evidence.reason += `；内容不同：${evidence.mismatchedKeys.join("、")}`;
  return {
    hasBisign: signs.length > 0, hasBikeyInMod: keys.length > 0,
    allCopiedToServer: keys.length > 0 && evidence.deployedKeyCount === keys.length && !evidence.readErrors.length,
    status, label: MOD_BIKEY_STATUS_LABELS[status], evidence,
  };
}

export interface BikeyCopyResult {
  copied: number;
  total: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** 文件写入失败必须出现在任务结果中，不能报告成功。 */
export function copyBikeysForMod(modPath: string, modDirName: string, serverDir: string): BikeyCopyResult {
  maintenanceLocks.assertAvailable({ paths: [{ path: path.resolve(modPath), mode: "read" }, { path: path.resolve(getServerKeysDirectory(serverDir)), mode: "write" }] });
  const result: BikeyCopyResult = { copied: 0, total: 0, skipped: 0, failed: 0, errors: [] };
  let bikeys: ModBikeyFile[];
  try {
    bikeys = findModBikeys(modPath);
    fs.mkdirSync(getServerKeysDirectory(serverDir), { recursive: true });
  } catch (error) {
    result.failed++;
    result.errors.push(`${modDirName}: ${errorCode(error)}`);
    return result;
  }
  const targets = new Map<string, Buffer>();
  // 写入前检测同一模组内的重名冲突，避免后一个文件覆盖前一个。
  try {
    for (const key of bikeys) {
      const target = pathIdentity(getCopiedBikeyPath(getServerKeysDirectory(serverDir), modDirName, key));
      const content = fs.readFileSync(key.fullPath);
      if (!content.length || (targets.has(target) && !targets.get(target)!.equals(content))) {
        throw new Error("公钥为空或部署文件名冲突");
      }
      targets.set(target, content);
    }
  } catch {
    result.failed++;
    result.errors.push(`${modDirName}: 公钥读取失败、为空或部署文件名冲突`);
    return result;
  }
  for (const bikey of bikeys) {
    result.total++;
    try {
      if (isBikeyPresentOnServer(getServerKeysDirectory(serverDir), modDirName, bikey)) {
        result.skipped++;
        continue;
      }
      fs.copyFileSync(bikey.fullPath, getCopiedBikeyPath(getServerKeysDirectory(serverDir), modDirName, bikey));
      if (!isBikeyPresentOnServer(getServerKeysDirectory(serverDir), modDirName, bikey)) throw new Error("部署后内容不一致");
      result.copied++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${modDirName}/${bikey.name}: ${errorCode(error)}`);
    }
  }
  return result;
}

export function copyBikeysForMods(mods: { modPath: string; modDirName: string }[], serverDir: string): BikeyCopyResult {
  maintenanceLocks.assertAvailable({ paths: [{ path: path.resolve(getServerKeysDirectory(serverDir)), mode: "write" }, ...mods.map((mod) => ({ path: path.resolve(mod.modPath), mode: "read" as const }))] });
  const combined: BikeyCopyResult = { copied: 0, total: 0, skipped: 0, failed: 0, errors: [] };
  for (const mod of mods) {
    const one = copyBikeysForMod(mod.modPath, mod.modDirName, serverDir);
    combined.copied += one.copied;
    combined.total += one.total;
    combined.skipped += one.skipped;
    combined.failed += one.failed;
    combined.errors.push(...one.errors);
  }
  return combined;
}

export function listServerBikeys(serverDir: string): string[] {
  const keysDirectory = getServerKeysDirectory(serverDir);
  if (!fs.existsSync(keysDirectory)) return [];
  return fs.readdirSync(keysDirectory).filter((file) => /\.bikey$/i.test(file)).map((file) => path.join(keysDirectory, file));
}
