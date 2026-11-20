import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

export type ProcessIdentityStatus = "match" | "mismatch" | "unknown";

export interface ProcessIdentityMarkers {
  /** Arma `-name=<uuid>` profile name */
  profileName?: string;
  /** Expected `-port=` value */
  port?: number;
}

export function isValidPid(pid: unknown): pid is number {
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0;
}

/**
 * 进程信息 TTL 缓存：Windows 上取可执行路径/命令行各要拉起一次 PowerShell，
 * 状态接口轮询时会明显阻塞事件循环。只缓存成功结果，2s 内复用。
 */
const PROCESS_INFO_TTL_MS = 2000;

interface ProcessInfoCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const exePathCache = new Map<number, ProcessInfoCacheEntry<string>>();
const commandLineCache = new Map<number, ProcessInfoCacheEntry<string>>();

function readProcessInfoCache<T>(
  cache: Map<number, ProcessInfoCacheEntry<T>>,
  pid: number
): T | undefined {
  const hit = cache.get(pid);
  if (!hit) {
    return undefined;
  }
  if (hit.expiresAt <= Date.now()) {
    cache.delete(pid);
    return undefined;
  }
  return hit.value;
}

function writeProcessInfoCache<T>(
  cache: Map<number, ProcessInfoCacheEntry<T>>,
  pid: number,
  value: T
): void {
  cache.set(pid, { value, expiresAt: Date.now() + PROCESS_INFO_TTL_MS });
}

/** 进程退出后清缓存，避免 PID 复用时命中旧进程信息。 */
export function invalidateProcessIdentityCache(pid?: number): void {
  if (pid === undefined) {
    exePathCache.clear();
    commandLineCache.clear();
    return;
  }
  exePathCache.delete(pid);
  commandLineCache.delete(pid);
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

const EXE_PATH_PS_ENCODED = encodePowerShellCommand(
  [
    "$p = 0",
    "if ([uint32]::TryParse($env:A3ST_TARGET_PID, [ref]$p) -and $p -gt 0) {",
    "  (Get-Process -Id ([int]$p) -ErrorAction Stop).Path",
    "}",
  ].join("\n")
);

const CMDLINE_PS_ENCODED = encodePowerShellCommand(
  [
    "$p = 0",
    "if ([uint32]::TryParse($env:A3ST_TARGET_PID, [ref]$p) -and $p -gt 0) {",
    '  (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p)).CommandLine',
    "}",
  ].join("\n")
);

/** 启动身份不按 PID 缓存；即使 PID 被同一可执行程序复用，也必须重建健康证据。 */
export async function getProcessSessionIdentity(pid: number): Promise<string | null> {
  if (!isValidPid(pid)) return null;
  try {
    if (process.platform === "win32") {
      const script = '$p = Get-Process -Id ([int]$env:A3ST_TARGET_PID) -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks';
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(script)], {
        encoding: "utf8", timeout: 3000, windowsHide: true, env: { ...process.env, A3ST_TARGET_PID: String(pid) },
      });
      const ticks = stdout.trim();
      return /^\d+$/.test(ticks) ? `${pid}:${ticks}` : null;
    }
    const stat = await fs.promises.readFile(`/proc/${pid}/stat`, "utf8");
    const startTicks = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
    const boot = (await fs.promises.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    return /^\d+$/.test(startTicks ?? "") && boot ? `${boot}:${pid}:${startTicks}` : null;
  } catch { return null; }
}

/** 维护专用停止：不使用宽松的 PID/名称匹配，也不因身份读取失败升级强杀。 */
export async function stopProcessSession(pid: number, session: string, executable: string, graceMs = 8000): Promise<void> {
  if (!isValidPid(pid) || !session || !path.isAbsolute(executable)) throw new Error("维护进程身份无效");
  if (process.platform === "win32") {
    // 先固定原生进程句柄，再比较 StartTime/Path 并通过同一 Process 对象终止。
    // 不另起 taskkill 按可复用 PID 寻址，也不终止未登记的子进程。
    const script = [
      '$ErrorActionPreference = "Stop"',
      '$p = Get-Process -Id ([int]$env:A3ST_TARGET_PID) -ErrorAction SilentlyContinue',
      'if ($null -eq $p) { Write-Output "EXITED"; exit 0 }',
      'try {',
      '  $handle = $p.Handle',
      '  $identity = "{0}:{1}" -f $p.Id, $p.StartTime.ToUniversalTime().Ticks',
      '  if ($identity -cne $env:A3ST_EXPECTED_SESSION -or -not [string]::Equals($p.Path, $env:A3ST_EXPECTED_EXE, [StringComparison]::OrdinalIgnoreCase)) { throw "SESSION_CHANGED" }',
      '  $p.Kill()',
      '  if (-not $p.WaitForExit([int]$env:A3ST_STOP_TIMEOUT)) { throw "STOP_TIMEOUT" }',
      '  Write-Output "EXITED"',
      '} finally { $p.Dispose() }',
    ].join("\n");
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(script)], {
      encoding: "utf8", timeout: graceMs + 5000, windowsHide: true,
      env: { ...process.env, A3ST_TARGET_PID: String(pid), A3ST_EXPECTED_SESSION: session, A3ST_EXPECTED_EXE: executable, A3ST_STOP_TIMEOUT: String(graceMs) },
    });
    if (stdout.trim() !== "EXITED") throw new Error("未确认维护进程退出");
  } else if (process.platform === "linux") {
    const inspect = (): "running" | "exited" => {
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
        if (fields[0] === "Z" || fields[0] === "X") return "exited";
        const boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
        if (`${boot}:${pid}:${fields[19]}` !== session || fs.realpathSync(`/proc/${pid}/exe`) !== resolveComparablePath(executable)) throw new Error("维护进程会话变化");
        return "running";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && !fs.existsSync(`/proc/${pid}`)) return "exited";
        throw error;
      }
    };
    const send = (signal: NodeJS.Signals) => {
      // 检查与发信号间不让出事件循环；每次升级均重新核对会话。
      if (inspect() === "exited") return;
      try { process.kill(pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    };
    send("SIGTERM");
    for (const [index, timeout] of [graceMs, 2000].entries()) {
      const deadline = performance.now() + timeout;
      while (inspect() !== "exited" && performance.now() < deadline) await sleep(100);
      if (inspect() === "exited") { invalidateProcessIdentityCache(pid); return; }
      if (index === 0) send("SIGKILL");
    }
    throw new Error("维护进程停止超时");
  } else throw new Error("当前平台不支持维护进程会话停止");
  invalidateProcessIdentityCache(pid);
}

export function isProcessRunning(pid: number): boolean {
  if (!isValidPid(pid)) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      return new RegExp(`(?:^|\\s|,|")${pid}(?:\\s|,|"|$)`).test(out);
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getProcessExecutablePath(pid: number): string | null {
  if (!isValidPid(pid)) {
    return null;
  }
  const cached = readProcessInfoCache(exePathCache, pid);
  if (cached !== undefined) {
    return cached;
  }
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", EXE_PATH_PS_ENCODED],
        {
          encoding: "utf-8",
          timeout: 3000,
          env: { ...process.env, A3ST_TARGET_PID: String(pid) },
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        }
      );
      const trimmed = out.trim();
      if (trimmed) {
        writeProcessInfoCache(exePathCache, pid, trimmed);
        return trimmed;
      }
      return null;
    }
    const exeLink = `/proc/${pid}/exe`;
    if (fs.existsSync(exeLink)) {
      const resolved = fs.realpathSync(exeLink);
      writeProcessInfoCache(exePathCache, pid, resolved);
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
}

/** 异步版本：不阻塞事件循环，供进程状态查询等高频路径使用。 */
export async function getProcessExecutablePathAsync(pid: number): Promise<string | null> {
  if (!isValidPid(pid)) {
    return null;
  }
  const cached = readProcessInfoCache(exePathCache, pid);
  if (cached !== undefined) {
    return cached;
  }
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", EXE_PATH_PS_ENCODED],
        {
          encoding: "utf-8",
          timeout: 3000,
          env: { ...process.env, A3ST_TARGET_PID: String(pid) },
          windowsHide: true,
        }
      );
      const trimmed = String(stdout).trim();
      if (trimmed) {
        writeProcessInfoCache(exePathCache, pid, trimmed);
        return trimmed;
      }
      return null;
    }
    const exeLink = `/proc/${pid}/exe`;
    if (fs.existsSync(exeLink)) {
      const resolved = fs.realpathSync(exeLink);
      writeProcessInfoCache(exePathCache, pid, resolved);
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
}

export function getProcessCommandLine(pid: number): string | null {
  if (!isValidPid(pid)) {
    return null;
  }
  const cached = readProcessInfoCache(commandLineCache, pid);
  if (cached !== undefined) {
    return cached;
  }
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", CMDLINE_PS_ENCODED],
        {
          encoding: "utf-8",
          timeout: 4000,
          env: { ...process.env, A3ST_TARGET_PID: String(pid) },
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        }
      );
      const trimmed = out.trim();
      if (trimmed) {
        writeProcessInfoCache(commandLineCache, pid, trimmed);
        return trimmed;
      }
      return null;
    }
    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (!fs.existsSync(cmdlinePath)) {
      return null;
    }
    const raw = fs.readFileSync(cmdlinePath);
    const line = raw.toString("utf-8").replace(/\0/g, " ").trim();
    if (line) {
      writeProcessInfoCache(commandLineCache, pid, line);
      return line;
    }
    return null;
  } catch {
    return null;
  }
}

/** 异步版本：不阻塞事件循环。 */
export async function getProcessCommandLineAsync(pid: number): Promise<string | null> {
  if (!isValidPid(pid)) {
    return null;
  }
  const cached = readProcessInfoCache(commandLineCache, pid);
  if (cached !== undefined) {
    return cached;
  }
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", CMDLINE_PS_ENCODED],
        {
          encoding: "utf-8",
          timeout: 4000,
          env: { ...process.env, A3ST_TARGET_PID: String(pid) },
          windowsHide: true,
        }
      );
      const trimmed = String(stdout).trim();
      if (trimmed) {
        writeProcessInfoCache(commandLineCache, pid, trimmed);
        return trimmed;
      }
      return null;
    }
    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (!fs.existsSync(cmdlinePath)) {
      return null;
    }
    const raw = fs.readFileSync(cmdlinePath);
    const line = raw.toString("utf-8").replace(/\0/g, " ").trim();
    if (line) {
      writeProcessInfoCache(commandLineCache, pid, line);
      return line;
    }
    return null;
  } catch {
    return null;
  }
}

/** 异步判断进程是否存活（Windows 走 tasklist，避免 EPERM 误判）。 */
export async function isProcessRunningAsync(pid: number): Promise<boolean> {
  if (!isValidPid(pid)) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/NH"],
        { encoding: "utf-8", timeout: 2000, windowsHide: true }
      );
      return new RegExp(`(?:^|\\s|,|")${pid}(?:\\s|,|"|$)`).test(String(stdout));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandLineContainsName(commandLine: string, profileName: string): boolean {
  const needle = profileName.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const lower = commandLine.toLowerCase();
  if (lower.includes(`-name=${needle}`)) {
    return true;
  }
  if (lower.includes(`-name ${needle}`)) {
    return true;
  }
  return false;
}

function commandLineContainsPort(commandLine: string, port: number): boolean {
  if (!port || port <= 0) {
    return true;
  }
  const lower = commandLine.toLowerCase();
  const portText = String(port);
  if (lower.includes(`-port=${portText}`)) {
    return true;
  }
  if (lower.includes(`-port ${portText}`)) {
    return true;
  }
  return false;
}

/** Exported for unit tests */
export function commandLineContainsNameForTest(
  commandLine: string,
  profileName: string
): boolean {
  return commandLineContainsName(commandLine, profileName);
}

/**
 * Fallback identity check when full verification is inconclusive (e.g. the
 * executable path cannot be resolved): matches our `-name=<uuid>` marker in
 * the raw command line. Returns null when the command line is unreadable.
 */
export function commandLineMatchesMarkers(
  pid: number,
  profileName: string
): boolean | null {
  const commandLine = getProcessCommandLine(pid);
  if (commandLine === null) {
    return null;
  }
  return commandLineContainsName(commandLine, profileName);
}

/** Exported for unit tests */
export function commandLineContainsPortForTest(
  commandLine: string,
  port: number
): boolean {
  return commandLineContainsPort(commandLine, port);
}

function resolveComparablePath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    try {
      return path.resolve(target);
    } catch {
      return target;
    }
  }
}

function compareIdentity(
  expectedFullPath: string,
  actualPath: string | null,
  commandLine: string | null,
  markers?: ProcessIdentityMarkers
): ProcessIdentityStatus {
  if (!actualPath) {
    return "unknown";
  }
  if (resolveComparablePath(actualPath).toLowerCase() !== expectedFullPath.toLowerCase()) {
    return "mismatch";
  }
  if (!markers) {
    return "match";
  }
  const hasName = Boolean(markers.profileName && markers.profileName.trim());
  const hasPort = Boolean(markers.port && markers.port > 0);
  if (!hasName && !hasPort) {
    return "match";
  }
  if (!commandLine) {
    return "unknown";
  }
  if (hasName && markers.profileName && !commandLineContainsName(commandLine, markers.profileName)) {
    return "mismatch";
  }
  if (hasPort && markers.port && !commandLineContainsPort(commandLine, markers.port)) {
    return "mismatch";
  }
  return "match";
}

export function verifyProcessIdentity(
  pid: number,
  expectedExecutable: string,
  markers?: ProcessIdentityMarkers
): ProcessIdentityStatus {
  if (!isValidPid(pid) || !expectedExecutable.trim()) {
    return "unknown";
  }
  const expectedFullPath = resolveComparablePath(expectedExecutable);
  const actualPath = getProcessExecutablePath(pid);
  const hasMarkers = Boolean(markers && ((markers.profileName && markers.profileName.trim()) || (markers.port && markers.port > 0)));
  const commandLine = actualPath && hasMarkers ? getProcessCommandLine(pid) : null;
  return compareIdentity(expectedFullPath, actualPath, commandLine, markers);
}

/** 异步版本：PowerShell/tasklist 调用不占用事件循环。 */
export async function verifyProcessIdentityAsync(
  pid: number,
  expectedExecutable: string,
  markers?: ProcessIdentityMarkers
): Promise<ProcessIdentityStatus> {
  if (!isValidPid(pid) || !expectedExecutable.trim()) {
    return "unknown";
  }
  const expectedFullPath = resolveComparablePath(expectedExecutable);
  const actualPath = await getProcessExecutablePathAsync(pid);
  const hasMarkers = Boolean(markers && ((markers.profileName && markers.profileName.trim()) || (markers.port && markers.port > 0)));
  const commandLine = actualPath && hasMarkers ? await getProcessCommandLineAsync(pid) : null;
  return compareIdentity(expectedFullPath, actualPath, commandLine, markers);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 轮询等待进程退出；返回是否在超时前退出。 */
export async function waitForProcessExit(
  pid: number,
  timeoutMs = 8000,
  intervalMs = 200
): Promise<boolean> {
  if (!isValidPid(pid)) {
    return true;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(intervalMs);
  }
  return !isProcessRunning(pid);
}

/**
 * 终止进程树并等待真正退出：
 * Linux 上 SIGTERM 是异步的，发出后立刻返回会把「仍在关闭」误报为已停止，
 * 进而允许重复 spawn 导致双实例/端口冲突；超时后补 SIGKILL。
 */
export async function killProcessTreeAndWait(
  pid: number,
  graceMs = 8000
): Promise<boolean> {
  const killed = killProcessTree(pid);
  if (!killed && !isProcessRunning(pid)) {
    return true;
  }
  if (!killed) {
    return false;
  }
  if (await waitForProcessExit(pid, graceMs)) {
    invalidateProcessIdentityCache(pid);
    return true;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone / no permission
    }
    if (await waitForProcessExit(pid, 2000)) {
      invalidateProcessIdentityCache(pid);
      return true;
    }
  }
  return false;
}

export function killProcessTree(pid: number): boolean {
  if (!isValidPid(pid)) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: 5000,
        windowsHide: true,
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
    invalidateProcessIdentityCache(pid);
    return true;
  } catch {
    return false;
  }
}
