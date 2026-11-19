import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { finished } from "node:stream/promises";
import { EventEmitter } from "node:events";
import { spawnConsoleCapture, type ConsoleCaptureHandle } from "./console-capture.js";
import {
  buildDedicatedServerUpdateArguments,
  buildWorkshopDownloadArguments,
  redactPasswordInArguments,
  redactSteamCmdConsoleChunk,
} from "./arguments.js";
import {
  authStateLabel,
  detectAuthStateFromOutput,
  type SteamCmdAuthState,
  type SteamCmdLoginMode,
} from "./login-mode.js";
import { sanitizeSteamCmdOutput } from "./output-sanitize.js";
import {
  hasWorkshopDownloadFailure,
  parseWorkshopDownloadSuccessIds,
  resolveWorkshopDownloadMissingIds,
} from "./workshop-download-result.js";
import {
  normalizeWorkshopRoot,
  type SteamCmdPathContext,
} from "./path-helper.js";
import { markWorkshopModsSynced } from "./workshop-update.js";
import { ensureWorkshopContentDirectory } from "../settings/steamcmd-settings.js";
import {
  isLinux,
  isWindows,
  resolveSteamCmdPath,
  steamCmdArchiveFileName,
  steamCmdBootstrapRelativePath,
  steamCmdDownloadUrl,
  steamCmdEntryName,
} from "../platform/index.js";
import { killProcessTree } from "../process/identity.js";
import { describeNetworkError, proxyFetch } from "./proxy-fetch.js";

const BOOTSTRAP_MARKER = steamCmdBootstrapRelativePath();
const SESSION_OUTPUT_MAX_CHARS = 500000;

export interface SteamCmdOptions {
  installDir: string;
  username?: string;
  password?: string;
}

interface SessionRunCapture {
  console: string;
  exitCode: number | null;
  exePath: string;
  argumentsString: string;
}

export class SteamCmdManager extends EventEmitter {
  private activeCapture: ConsoleCaptureHandle | null = null;
  private installDir: string;
  private _pathContext: SteamCmdPathContext;
  private sessionLogDir: string;
  private _username = "";
  private _password = "";
  private _loginMode: SteamCmdLoginMode = "password";
  private _authState: SteamCmdAuthState = "idle";
  private _workshopRoot = "";
  private _serverInstallPath = "";
  private sessionOutput = "";
  private latestSessionLogPath = "";
  private _aborted = false;
  /** 整次 SteamCMD 业务操作互斥（下载/更新/安装），不仅限单个子进程。 */
  private _busy = false;
  /**
   * 每次开始操作 +1；取消时再 +1，使旧协程即使被 clearAbort 也无法继续拉起进程。
   */
  private _runId = 0;

  constructor(installDir: string, pathContext?: SteamCmdPathContext) {
    super();
    this.installDir = installDir;
    this._pathContext = pathContext ?? {
      applicationBase: installDir,
      userDataDirectory: installDir,
    };
    this.sessionLogDir = path.join(installDir, "logs", "steamcmd");
    fs.mkdirSync(this.sessionLogDir, { recursive: true });
    // 上次异常退出可能留下 steamcmd 占着安装目录，导致新任务立刻失败或被系统锁死。
    // 该清理在 Windows 上要拉起 PowerShell（最长 3s），不能同步阻塞服务启动：
    // 延后到事件循环空闲执行，首次下载前足够完成。
    setImmediate(() => {
      try {
        this.purgeOrphanSteamCmdProcesses();
      } catch {
        /* ignore cleanup errors */
      }
    });
  }

  setCredentials(username: string, password: string): void {
    this._username = username;
    this._password = password;
  }

  setLoginMode(mode: SteamCmdLoginMode): void {
    this._loginMode = mode === "cached" ? "cached" : "password";
  }

  setWorkshopRoot(workshopRoot: string): void {
    this._workshopRoot = normalizeWorkshopRoot(this._pathContext, workshopRoot);
  }

  setServerInstallPath(serverInstallPath: string): void {
    this._serverInstallPath = serverInstallPath.trim();
  }

  get workshopRoot(): string {
    return this._workshopRoot;
  }

  get pathContext(): SteamCmdPathContext {
    return this._pathContext;
  }

  get serverInstallPath(): string {
    return this._serverInstallPath;
  }

  get loginMode(): SteamCmdLoginMode {
    return this._loginMode;
  }

  get authState(): SteamCmdAuthState {
    return this._authState;
  }

  get hasCredentials(): boolean {
    if (!this._username) {
      return false;
    }
    if (this._loginMode === "cached") {
      return true;
    }
    return !!this._password;
  }

  get isInstalled(): boolean {
    const entryPath = resolveSteamCmdPath(this.installDir);
    const bootstrapPath = path.join(this.installDir, BOOTSTRAP_MARKER);
    return fs.existsSync(entryPath) && fs.existsSync(bootstrapPath);
  }

  get isRunning(): boolean {
    return this._busy || this.activeCapture !== null;
  }

  get isBusy(): boolean {
    return this._busy;
  }

  get steamCmdDir(): string {
    return this.installDir;
  }

  async ensureInstalled(): Promise<void> {
    return this.withExclusiveLock(async (runId) => {
      await this.ensureInstalledBody(runId);
    });
  }

  private async ensureInstalledBody(runId: number): Promise<void> {
    this.throwIfStaleOrAborted(runId);
    if (this.isInstalled) {
      return;
    }
    fs.mkdirSync(this.installDir, { recursive: true });
    this.emit("progress", "下载 SteamCMD...");
    const archiveName = steamCmdArchiveFileName();
    const archivePath = path.join(this.installDir, archiveName);
    const downloadUrl = steamCmdDownloadUrl();
    let response;
    try {
      response = await proxyFetch(downloadUrl, { timeoutMs: 180000 });
    } catch (e) {
      throw new Error(
        `无法下载 SteamCMD（${downloadUrl}）。${describeNetworkError(e)}。请检查该域名是否被 hosts 拦截、能否访问 Steam CDN，或配置 HTTPS_PROXY；也可手动把 steamcmd.zip 解压到 SteamCMD 目录。`
      );
    }
    this.throwIfStaleOrAborted(runId);
    if (!response.ok || !response.body) {
      throw new Error(`下载 SteamCMD 失败: HTTP ${response.status}（${downloadUrl}）`);
    }
    const reader = response.body.getReader();
    const writer = fs.createWriteStream(archivePath);
    let streamError: unknown = null;
    writer.on("error", (err) => {
      streamError = err;
    });
    const total = parseInt(response.headers.get("content-length") ?? "0", 10);
    let received = 0;
    try {
      while (true) {
        this.throwIfStaleOrAborted(runId);
        if (streamError) {
          throw streamError;
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.length;
        writer.write(value);
        if (total > 0) {
          this.emit("progress", `下载 SteamCMD... ${Math.round((received / total) * 100)}%`);
        }
      }
      writer.end();
      await finished(writer);
    } catch (err) {
      await new Promise<void>((resolve) => {
        if (writer.closed) {
          resolve();
          return;
        }
        const fallback = setTimeout(resolve, 200);
        writer.once("close", () => {
          clearTimeout(fallback);
          resolve();
        });
        writer.destroy();
      });
      await reader.cancel().catch(() => {});
      try {
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
      } catch {
        /* ignore cleanup error */
      }
      throw err;
    }

    this.throwIfStaleOrAborted(runId);
    this.emit("progress", "解压 SteamCMD...");
    if (isWindows()) {
      await this.extractSteamCmdWindowsArchive(archivePath, this.installDir);
    } else if (isLinux()) {
      await this.extractSteamCmdLinuxArchive(archivePath, this.installDir);
    } else {
      throw new Error(`当前平台 (${process.platform}) 不支持自动安装 SteamCMD，请手动安装。`);
    }

    const entryPath = resolveSteamCmdPath(this.installDir);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`解压完成但未找到 ${steamCmdEntryName()}，请检查网络或手动下载 SteamCMD。`);
    }
    if (isLinux()) {
      fs.chmodSync(entryPath, 0o755);
    }
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    if (!this.isInstalled) {
      this.throwIfStaleOrAborted(runId);
      this.emit("progress", "初始化 SteamCMD...");
      await this.runBootstrapUpdate(runId);
      if (!this.isInstalled) {
        throw new Error(
          "SteamCMD 初始化未完成，缺少 public 资源文件。请确认可访问 Steam CDN 后重试。"
        );
      }
    }

    this.emit("progress", "SteamCMD 安装完成");
  }

  private async runBootstrapUpdate(runId: number): Promise<void> {
    const timeoutMs = 180000;
    let output = "";
    const timer = setTimeout(() => {
      this.kill();
    }, timeoutMs);

    try {
      this.sessionOutput = "";
      const exitCode = await this.runCapturedProcess(runId, "+quit", (chunk) => {
        output += chunk;
      });
      this.throwIfStaleOrAborted(runId);
      if (!this.isInstalled) {
        throw new Error(`SteamCMD 初始化未完成\n${output.slice(-500)}`);
      }
      if (exitCode !== 0 && exitCode !== null) {
        throw new Error(`SteamCMD 初始化退出码: ${exitCode}\n${output.slice(-500)}`);
      }
      this.emit("complete", output);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 安装/更新 Arma 3 专用服务器 */
  async updateServer(serverDir?: string, onOutput?: (line: string) => void): Promise<void> {
    return this.withExclusiveLock(async (runId) => {
      await this.ensureInstalledBody(runId);
      this.requireCredentials();
      this.throwIfStaleOrAborted(runId);
      const installDir = serverDir ?? this._serverInstallPath ?? this.installDir;
      this.markLoginAttempt();
      const argumentsString = buildDedicatedServerUpdateArguments(
        this._username,
        this._password,
        installDir,
        { loginMode: this._loginMode },
      );
      await this.runSteamCmdArguments(runId, argumentsString, onOutput, { isAppUpdate: true });
    });
  }

  /** 下载 Workshop 模组 */
  async downloadWorkshopMods(modIds: number[], onOutput?: (line: string) => void): Promise<void> {
    return this.withExclusiveLock(async (runId) => {
      await this.ensureInstalledBody(runId);
      this.requireCredentials();

      if (!modIds.length) {
        throw new Error("没有要下载的 Workshop 模组 ID。");
      }

      const workshopRoot = normalizeWorkshopRoot(this._pathContext, this._workshopRoot);
      if (!workshopRoot.trim()) {
        throw new Error(
          "SteamCMD 程序目录未配置。请在「工具 → SteamCMD 设置」中填写，或点「下载 SteamCMD」使用工具内置目录。"
        );
      }

      ensureWorkshopContentDirectory(workshopRoot);

      const uniqueIds = dedupePositiveIds(modIds);
      this.markLoginAttempt();
      const batchArgs = buildWorkshopDownloadArguments(
        this._username,
        this._password,
        workshopRoot,
        uniqueIds,
        { loginMode: this._loginMode },
      );
      let batchOutput = "";
      try {
        this.throwIfStaleOrAborted(runId);
        batchOutput = await this.runSteamCmdArguments(runId, batchArgs, onOutput, {
          isWorkshop: true,
          emitComplete: false,
        });
      } catch (err) {
        this.throwIfStaleOrAborted(runId);
        const msg = err instanceof Error ? err.message : String(err);
        // Guard/手机确认必须立即上抛：继续重试会再次拉起 SteamCMD 登录，
        // 形成连续认证请求（登录风暴），极易触发 Steam 风控。
        if (this._authState === "waiting_guard" || this.needsSteamGuard(msg)) {
          throw err;
        }
        const hint = `[提示] 批量下载未完全成功，将检查失败项并重试。详情: ${msg.slice(0, 200)}\n`;
        this.appendSessionOutput(hint);
        this.emit("output", hint);
        onOutput?.(hint);
      }

      // Retry remaining items in ONE merged SteamCMD process per attempt
      // (single login), instead of one process per mod (which caused the
      // "crazy login storm"). validate only on the final attempt.
      let remaining = resolveWorkshopDownloadMissingIds(uniqueIds, batchOutput);
      const maxRounds = 2;
      for (let round = 1; round <= maxRounds && remaining.length > 0; round++) {
        this.throwIfStaleOrAborted(runId);
        const isLastRound = round === maxRounds;
        const hint =
          `[重试] 尚有 ${remaining.length} 个模组未确认完成，合并为单个 SteamCMD 进程重试 `
          + `第 ${round}/${maxRounds} 轮${isLastRound ? "（含 validate 校验）" : ""}: ${remaining.join(", ")}\n`;
        this.appendSessionOutput(hint);
        this.emit("output", hint);
        onOutput?.(hint);

        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        this.throwIfStaleOrAborted(runId);

        const retryArgs = buildWorkshopDownloadArguments(
          this._username,
          this._password,
          workshopRoot,
          remaining,
          { validate: isLastRound, loginMode: this._loginMode },
        );
        let retryOutput = "";
        try {
          retryOutput = await this.runSteamCmdArguments(runId, retryArgs, onOutput, {
            isWorkshop: true,
            emitComplete: false,
          });
        } catch (err) {
          this.throwIfStaleOrAborted(runId);
          const msg = err instanceof Error ? err.message : String(err);
          // 与批量轮一致：Guard 场景禁止任何后续重试。
          if (this._authState === "waiting_guard" || this.needsSteamGuard(msg)) {
            throw err;
          }
          const failHint = `[失败] 重试轮出错: ${msg}\n`;
          this.appendSessionOutput(failHint);
          this.emit("output", failHint);
          onOutput?.(failHint);
        }
        // If the retry produced no parseable output at all, keep all as remaining
        // so we don't silently drop them.
        remaining = resolveWorkshopDownloadMissingIds(remaining, retryOutput);
      }

      this.throwIfStaleOrAborted(runId);

      if (remaining.length > 0) {
        throw new Error(
          `以下 Workshop 模组下载失败（超时或未完成）: ${remaining.join(", ")}。`
          + `大体积模组（如 CUP Terrains - Core / 583496184）可稍后再单独下载，或检查磁盘空间与网络。`,
        );
      }

      // Pack mtimes often lag Workshop time_updated; stamp synced folders so the
      // UI / cron stop reporting permanent "有更新" after a confirmed download.
      markWorkshopModsSynced(workshopRoot, uniqueIds);

      this.emit("complete", this.sessionOutput);
    });
  }

  /**
   * 全局互斥：同一时刻只允许一次 SteamCMD 业务操作。
   * 取消时提升 runId，旧协程在检查点会失败，且不会被新操作的 clearAbort 复活。
   */
  private async withExclusiveLock<T>(fn: (runId: number) => Promise<T>): Promise<T> {
    if (this._busy) {
      throw new Error("SteamCMD 进程已在运行，请等待当前任务完成");
    }
    this._busy = true;
    this._aborted = false;
    const runId = ++this._runId;
    try {
      return await fn(runId);
    } finally {
      this._busy = false;
    }
  }

  private requireCredentials(): void {
    if (!this._username) {
      throw new Error("SteamCMD 账号未配置。请在「工具 → SteamCMD 设置」中填写账号。");
    }
    if (this._loginMode === "password" && !this._password) {
      throw new Error(
        "SteamCMD 密码未配置。请填写密码，或将登录模式改为「优先使用本机登录缓存」。",
      );
    }
  }

  private markLoginAttempt(): void {
    this._authState = this._loginMode === "cached" ? "cached_login" : "password_login";
    const hint =
      this._loginMode === "cached"
        ? "[登录] 优先使用本机登录缓存（仅用户名，省略密码参数）\n"
        : "[登录] 使用用户名/密码登录\n";
    this.appendSessionOutput(hint);
    this.emit("output", hint);
  }

  private updateAuthStateFromOutput(output: string): void {
    const detected = detectAuthStateFromOutput(output);
    if (detected) {
      this._authState = detected;
    }
  }

  private throwIfGuardPending(output: string): void {
    this.updateAuthStateFromOutput(output);
    if (this._authState !== "waiting_guard" && !this.needsSteamGuard(output)) {
      return;
    }
    this._authState = "waiting_guard";
    const label = authStateLabel(this._authState);
    throw new Error(
      `SteamCMD 需要手机确认（${label}）。已停止自动重试以避免连续认证请求；`
      + `请在手机上批准后，再手动重新触发一次下载/更新以完成重新授权。`,
    );
  }

  /** 使用与 C# ProcessStartInfo.Arguments 相同的参数字符串启动 SteamCMD。 */
  private async runSteamCmdArguments(
    runId: number,
    argumentsString: string,
    onOutput?: (line: string) => void,
    flags: {
      isWorkshop?: boolean;
      isAppUpdate?: boolean;
      emitComplete?: boolean;
    } = {},
    retryCount = 0,
  ): Promise<string> {
    this.throwIfStaleOrAborted(runId);
    if (this.activeCapture !== null) {
      throw new Error("SteamCMD 进程已在运行，请等待当前任务完成");
    }

    const sessionLogPath = this.createSessionLogPath();
    this.sessionOutput = "";
    const shouldEmitComplete = flags.emitComplete !== false;

    let combined = "";
    const exitCode = await this.runCapturedProcess(runId, argumentsString, (chunk) => {
      const clean = sanitizeSteamCmdOutput(chunk);
      combined += clean;
      onOutput?.(clean);
    });

    // 用户取消后不得再走 Workshop 早退/内部重试，否则会继续拉起 SteamCMD。
    this.throwIfStaleOrAborted(runId);

    const captureResult: SessionRunCapture = {
      console: combined,
      exitCode,
      exePath: resolveSteamCmdPath(this.installDir),
      argumentsString,
    };
    this.writeSessionLogFile(sessionLogPath, captureResult, flags);
    this.updateAuthStateFromOutput(combined);

    // Guard / 手机确认：绝不自动重试，避免连续认证请求。
    if (this.needsSteamGuard(combined) || this._authState === "waiting_guard") {
      this.throwIfGuardPending(combined);
    }

    if (flags.isWorkshop && hasWorkshopDownloadFailure(combined)) {
      // 部分失败：不抛错，交由调用方按缺失列表统一重试/判定，避免重复登录风暴。
      return combined;
    }

    if (exitCode === 0 || this.isSteamCmdOutputSuccess(combined, flags)) {
      if (!this.needsSteamGuard(combined)) {
        this._authState = "authenticated";
      }
      if (shouldEmitComplete) {
        this.emit("complete", combined);
      }
      return combined;
    }
    if (
      !this._aborted
      && runId === this._runId
      && retryCount < 1
      && this.shouldRetrySteamCmd(exitCode, combined)
      && !this.needsSteamGuard(combined)
    ) {
      this.throwIfStaleOrAborted(runId);
      const retryHint = "Update complete, launching SteamCMD...\n";
      this.appendSessionOutput(retryHint);
      this.emit("output", retryHint);
      onOutput?.(retryHint);
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      this.throwIfStaleOrAborted(runId);
      return this.runSteamCmdArguments(runId, argumentsString, onOutput, flags, retryCount + 1);
    }
    throw new Error(`SteamCMD 退出代码: ${exitCode}\n${combined.slice(-500)}`);
  }

  private async runCapturedProcess(
    runId: number,
    argumentsString: string,
    onChunk: (chunk: string) => void,
  ): Promise<number | null> {
    this.throwIfStaleOrAborted(runId);
    const exePath = resolveSteamCmdPath(this.installDir);
    const capture = await spawnConsoleCapture(
      exePath,
      argumentsString,
      this.installDir,
      (chunk) => {
        const clean = redactSteamCmdConsoleChunk(
          sanitizeSteamCmdOutput(chunk),
          this._password,
        );
        this.appendSessionOutput(clean);
        this.emit("output", clean);
        onChunk(clean);
      },
      this.installDir,
      { password: this._password },
    );
    this.activeCapture = capture;
    try {
      return await capture.waitForExit();
    } finally {
      if (this.activeCapture === capture) {
        this.activeCapture = null;
      }
    }
  }

  private createSessionLogPath(): string {
    const stamp = formatSessionLogStamp();
    return path.join(this.sessionLogDir, `steamcmd_${stamp}.log`);
  }

  private writeSessionLogFile(
    logFilePath: string,
    capture: SessionRunCapture,
    flags: { isWorkshop?: boolean; isAppUpdate?: boolean },
  ): void {
    const safeArgs = redactPasswordInArguments(capture.argumentsString, this._password);
    const success =
      capture.exitCode === 0 ||
      this.isSteamCmdOutputSuccess(capture.console, flags);
    const builder: string[] = [
      `时间: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
      `程序: ${capture.exePath}`,
      `参数: ${safeArgs}`,
      `退出码: ${capture.exitCode ?? "null"}`,
      `成功: ${success}`,
      `捕获: ${isWindows() ? "静默运行 + console_log.txt" : "stdout/stderr 管道"}`,
      "",
      "--- console ---",
      capture.console.trimEnd(),
    ];
    try {
      fs.writeFileSync(logFilePath, builder.join("\n"), "utf-8");
      this.latestSessionLogPath = logFilePath;
    } catch {
      /* best effort */
    }
  }

  private isSteamCmdOutputSuccess(
    output: string,
    flags: { isWorkshop?: boolean; isAppUpdate?: boolean },
  ): boolean {
    if (/Success!\s+App\s+['"]233780['"]/i.test(output)) {
      return true;
    }
    if (flags.isAppUpdate && /fully installed|already up to date/i.test(output)) {
      return true;
    }
    if (flags.isWorkshop) {
      if (hasWorkshopDownloadFailure(output)) {
        return false;
      }
      // Accept any success/up-to-date phrasing SteamCMD emits, not just
      // "Success. Downloaded item" — otherwise already-current mods read as
      // failures and trigger needless retries (and re-logins).
      return parseWorkshopDownloadSuccessIds(output).length > 0;
    }
    return false;
  }

  private appendSessionOutput(text: string): void {
    this.sessionOutput += text;
    if (this.sessionOutput.length > SESSION_OUTPUT_MAX_CHARS) {
      this.sessionOutput = this.sessionOutput.slice(-SESSION_OUTPUT_MAX_CHARS);
    }
  }

  private shouldRetrySteamCmd(exitCode: number | null, output: string): boolean {
    if (exitCode === 7 && /Update complete, launching/i.test(output)) {
      return true;
    }
    return false;
  }

  /** 检查 Steam 是否需要 Guard 验证 */
  needsSteamGuard(logText: string): boolean {
    return detectAuthStateFromOutput(logText) === "waiting_guard"
      || /Steam Guard|Two-factor|Waiting for confirmation/i.test(logText);
  }

  async getLatestLog(maxLines = 300): Promise<string> {
    return this.getAggregatedLog(maxLines);
  }

  getAggregatedLog(maxLines = 300): string {
    if (this.sessionOutput.trim()) {
      return tailTextLines(this.sessionOutput, maxLines);
    }
    return sanitizeSteamCmdOutput(this.readLatestSessionLogTail(maxLines));
  }

  private readLatestSessionLogTail(maxLines: number): string {
    const latest = this.findLatestSessionLogPath();
    if (!latest) {
      return "";
    }
    try {
      const content = fs.readFileSync(latest, "utf-8");
      const marker = "--- console ---";
      const idx = content.indexOf(marker);
      if (idx >= 0) {
        return tailTextLines(content.slice(idx + marker.length), maxLines);
      }
      const legacyStdout = "--- stdout ---";
      const legacyIdx = content.indexOf(legacyStdout);
      if (legacyIdx >= 0) {
        return tailTextLines(content.slice(legacyIdx), maxLines);
      }
      return tailTextLines(content, maxLines);
    } catch (err) {
      return `无法读取日志: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private findLatestSessionLogPath(): string {
    if (this.latestSessionLogPath && fs.existsSync(this.latestSessionLogPath)) {
      return this.latestSessionLogPath;
    }
    if (!fs.existsSync(this.sessionLogDir)) {
      return "";
    }
    const files = fs
      .readdirSync(this.sessionLogDir)
      .filter((name) => name.startsWith("steamcmd_") && name.endsWith(".log"))
      .sort();
    if (files.length === 0) {
      return "";
    }
    return path.join(this.sessionLogDir, files[files.length - 1]);
  }

  kill(): void {
    const capture = this.activeCapture;
    const pid = capture?.pid;
    if (capture) {
      try {
        capture.kill();
      } catch {
        /* ignore */
      }
      // 保持 activeCapture 直到 waitForExit 结束，避免互斥空窗期再起一个进程。
    }
    if (pid) {
      killProcessTree(pid);
    }
  }

  /** 终止当前 SteamCMD，并阻止 download_mods 等循环继续拉起新进程。 */
  requestAbort(): void {
    this._aborted = true;
    // 使进行中的 runId 立刻失效；即便随后有人清 abort 标志，旧协程也不能继续。
    this._runId += 1;
    const hint = "[取消] 用户已请求停止 SteamCMD，将不再重试。\n";
    this.appendSessionOutput(hint);
    this.emit("output", hint);
    this.kill();
    this.purgeOrphanSteamCmdProcesses();
  }

  clearAbort(): void {
    this._aborted = false;
  }

  get isAborted(): boolean {
    return this._aborted;
  }

  /**
   * 杀掉本工具 SteamCMD 安装目录下仍存活的 steamcmd 进程（含自更新拉起的孤儿）。
   * 服务重启后构造时也会调用，避免「已占用」残留。
   */
  purgeOrphanSteamCmdProcesses(): number {
    return killSteamCmdProcessesUnderDir(this.installDir);
  }

  private throwIfStaleOrAborted(runId: number): void {
    if (this._aborted || runId !== this._runId) {
      throw new Error("SteamCMD 操作已取消");
    }
  }

  private async extractSteamCmdWindowsArchive(archivePath: string, destDir: string): Promise<void> {
    // execFile + 参数数组：路径经环境变量传给 PowerShell，不拼接 shell 字符串，消除引号/元字符注入面。
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Expand-Archive -LiteralPath $env:A3ST_ZIP -DestinationPath $env:A3ST_DEST -Force",
        ],
        {
          stdio: "pipe",
          timeout: 180000,
          windowsHide: true,
          env: { ...process.env, A3ST_ZIP: archivePath, A3ST_DEST: destDir },
        }
      );
    } catch (err) {
      throw new Error(`解压 SteamCMD 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async extractSteamCmdLinuxArchive(archivePath: string, destDir: string): Promise<void> {
    try {
      execFileSync("tar", ["-xzf", archivePath, "-C", destDir], {
        stdio: "pipe",
        timeout: 180000,
      });
    } catch (err) {
      throw new Error(`解压 SteamCMD 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

let sessionLogSeq = 0;

function formatSessionLogStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  sessionLogSeq = (sessionLogSeq + 1) % 10000;
  const seq = String(sessionLogSeq).padStart(4, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${ms}_${seq}`;
}

function dedupePositiveIds(modIds: readonly number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const modId of modIds) {
    if (modId === 0 || seen.has(modId)) {
      continue;
    }
    seen.add(modId);
    result.push(modId);
  }
  return result;
}

function tailTextLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return lines.join("\n").trimEnd();
  }
  return lines.slice(-maxLines).join("\n").trimEnd();
}

/** 仅终止位于 steamCmdInstallDir 下的 steamcmd 进程，避免误杀其它目录实例。 */
export function killSteamCmdProcessesUnderDir(steamCmdInstallDir: string): number {
  const root = path.resolve(steamCmdInstallDir);
  if (!root) {
    return 0;
  }
  try {
    if (isWindows()) {
      return killSteamCmdWindows(root);
    }
    return killSteamCmdUnix(root);
  } catch {
    return 0;
  }
}

function killSteamCmdWindows(root: string): number {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$root = $env:A3ST_STEAMCMD_ROOT",
    "$n = 0",
    // Get-Process 比 Get-CimInstance 轻；避免 powershell -Command - + stdin 在 CI 上挂死。
    "Get-Process -Name steamcmd -ErrorAction SilentlyContinue | ForEach-Object {",
    "  $exe = $_.Path",
    "  if ($exe -and $exe.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue",
    "    $script:n++",
    "  }",
    "}",
    "Write-Output $n",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      encoding: "utf-8",
      timeout: 3000,
      env: { ...process.env, A3ST_STEAMCMD_ROOT: root },
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const parsed = parseInt(String(out).trim().split(/\r?\n/).pop() ?? "0", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {
    return 0;
  }
  return 0;
}

function killSteamCmdUnix(root: string): number {
  const entry = resolveSteamCmdPath(root);
  let killed = 0;
  try {
    const out = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const space = trimmed.indexOf(" ");
      if (space <= 0) {
        continue;
      }
      const pid = parseInt(trimmed.slice(0, space), 10);
      const args = trimmed.slice(space + 1);
      if (!Number.isFinite(pid) || pid <= 0) {
        continue;
      }
      if (pid === process.pid) {
        continue;
      }
      const hit =
        args.includes(entry)
        || (args.includes("steamcmd") && args.includes(root));
      if (!hit) {
        continue;
      }
      if (killProcessTree(pid)) {
        killed += 1;
      }
    }
  } catch {
    return killed;
  }
  return killed;
}
