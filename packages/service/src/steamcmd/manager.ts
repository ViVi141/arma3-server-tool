import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { finished } from "node:stream/promises";
import { EventEmitter } from "node:events";
import { spawnConsoleCapture, type ConsoleCaptureHandle } from "./console-capture.js";
import {
  buildDedicatedServerUpdateArguments,
  buildWorkshopDownloadArguments,
  redactPasswordInArguments,
} from "./arguments.js";
import {
  normalizeWorkshopRoot,
  type SteamCmdPathContext,
} from "./path-helper.js";
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
  private pathContext: SteamCmdPathContext;
  private sessionLogDir: string;
  private _username = "";
  private _password = "";
  private _workshopRoot = "";
  private _serverInstallPath = "";
  private sessionOutput = "";
  private latestSessionLogPath = "";

  constructor(installDir: string, pathContext?: SteamCmdPathContext) {
    super();
    this.installDir = installDir;
    this.pathContext = pathContext ?? {
      applicationBase: installDir,
      userDataDirectory: installDir,
    };
    this.sessionLogDir = path.join(installDir, "logs", "steamcmd");
    fs.mkdirSync(this.sessionLogDir, { recursive: true });
  }

  setCredentials(username: string, password: string): void {
    this._username = username;
    this._password = password;
  }

  setWorkshopRoot(workshopRoot: string): void {
    this._workshopRoot = normalizeWorkshopRoot(this.pathContext, workshopRoot);
  }

  setServerInstallPath(serverInstallPath: string): void {
    this._serverInstallPath = serverInstallPath.trim();
  }

  get workshopRoot(): string {
    return this._workshopRoot;
  }

  get serverInstallPath(): string {
    return this._serverInstallPath;
  }

  get hasCredentials(): boolean {
    return !!(this._username && this._password);
  }

  get isInstalled(): boolean {
    const entryPath = resolveSteamCmdPath(this.installDir);
    const bootstrapPath = path.join(this.installDir, BOOTSTRAP_MARKER);
    return fs.existsSync(entryPath) && fs.existsSync(bootstrapPath);
  }

  get isRunning(): boolean {
    return this.activeCapture !== null;
  }

  get steamCmdDir(): string {
    return this.installDir;
  }

  async ensureInstalled(): Promise<void> {
    if (this.isInstalled) {
      return;
    }
    fs.mkdirSync(this.installDir, { recursive: true });
    this.emit("progress", "下载 SteamCMD...");
    const archiveName = steamCmdArchiveFileName();
    const archivePath = path.join(this.installDir, archiveName);
    const response = await fetch(steamCmdDownloadUrl());
    if (!response.ok || !response.body) {
      throw new Error(`下载 SteamCMD 失败: HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const writer = fs.createWriteStream(archivePath);
    const total = parseInt(response.headers.get("content-length") ?? "0", 10);
    let received = 0;
    while (true) {
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
      this.emit("progress", "初始化 SteamCMD...");
      await this.runBootstrapUpdate();
      if (!this.isInstalled) {
        throw new Error(
          "SteamCMD 初始化未完成，缺少 public 资源文件。请确认可访问 Steam CDN 后重试。"
        );
      }
    }

    this.emit("progress", "SteamCMD 安装完成");
  }

  private async runBootstrapUpdate(): Promise<void> {
    const timeoutMs = 180000;
    let output = "";
    const timer = setTimeout(() => {
      this.kill();
    }, timeoutMs);

    try {
      this.sessionOutput = "";
      const exitCode = await this.runCapturedProcess("+quit", (chunk) => {
        output += chunk;
      });
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
    await this.ensureInstalled();
    this.requireCredentials();
    const installDir = serverDir ?? this._serverInstallPath ?? this.installDir;
    const argumentsString = buildDedicatedServerUpdateArguments(
      this._username,
      this._password,
      installDir,
    );
    return this.runSteamCmdArguments(argumentsString, onOutput, { isAppUpdate: true });
  }

  /** 下载 Workshop 模组 */
  async downloadWorkshopMods(modIds: number[], onOutput?: (line: string) => void): Promise<void> {
    await this.ensureInstalled();
    this.requireCredentials();

    if (!modIds.length) {
      throw new Error("没有要下载的 Workshop 模组 ID。");
    }

    const workshopRoot = normalizeWorkshopRoot(this.pathContext, this._workshopRoot);
    if (!workshopRoot.trim()) {
      throw new Error(
        "SteamCMD 程序目录未配置。请在「工具 → SteamCMD 设置」中填写，或点「下载 SteamCMD」使用工具内置目录。"
      );
    }

    ensureWorkshopContentDirectory(workshopRoot);

    const argumentsString = buildWorkshopDownloadArguments(
      this._username,
      this._password,
      workshopRoot,
      modIds,
    );
    return this.runSteamCmdArguments(argumentsString, onOutput, { isWorkshop: true });
  }

  private requireCredentials(): void {
    if (!this._username) {
      throw new Error("SteamCMD 账号未配置。请在「工具 → SteamCMD 设置」中填写账号。");
    }
  }

  /** 使用与 C# ProcessStartInfo.Arguments 相同的参数字符串启动 SteamCMD。 */
  private async runSteamCmdArguments(
    argumentsString: string,
    onOutput?: (line: string) => void,
    flags: { isWorkshop?: boolean; isAppUpdate?: boolean } = {},
    retryCount = 0,
  ): Promise<void> {
    if (this.activeCapture !== null) {
      throw new Error("SteamCMD 进程已在运行，请等待当前任务完成");
    }

    const sessionLogPath = this.createSessionLogPath();
    this.sessionOutput = "";

    let combined = "";
    const exitCode = await this.runCapturedProcess(argumentsString, (chunk) => {
      combined += chunk;
      onOutput?.(chunk);
    });

    const captureResult: SessionRunCapture = {
      console: combined,
      exitCode,
      exePath: resolveSteamCmdPath(this.installDir),
      argumentsString,
    };
    this.writeSessionLogFile(sessionLogPath, captureResult, flags);

    if (exitCode === 0 || this.isSteamCmdOutputSuccess(combined, flags)) {
      this.emit("complete", combined);
      return;
    }
    if (retryCount < 1 && this.shouldRetrySteamCmd(exitCode, combined)) {
      const retryHint = "Update complete, launching SteamCMD...\n";
      this.appendSessionOutput(retryHint);
      this.emit("output", retryHint);
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      return this.runSteamCmdArguments(argumentsString, onOutput, flags, retryCount + 1);
    }
    throw new Error(`SteamCMD 退出代码: ${exitCode}\n${combined.slice(-500)}`);
  }

  private async runCapturedProcess(
    argumentsString: string,
    onChunk: (chunk: string) => void,
  ): Promise<number | null> {
    const exePath = resolveSteamCmdPath(this.installDir);
    const capture = await spawnConsoleCapture(
      exePath,
      argumentsString,
      this.installDir,
      (chunk) => {
        this.appendSessionOutput(chunk);
        this.emit("output", chunk);
        onChunk(chunk);
      },
      this.installDir,
    );
    this.activeCapture = capture;
    try {
      return await capture.waitForExit();
    } finally {
      this.activeCapture = null;
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
    if (flags.isWorkshop && /Success\.\s+Downloaded item/i.test(output)) {
      return true;
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
    return logText.includes("Steam Guard") || logText.includes("Two-factor") || logText.includes("email");
  }

  async getLatestLog(maxLines = 300): Promise<string> {
    return this.getAggregatedLog(maxLines);
  }

  getAggregatedLog(maxLines = 300): string {
    if (this.sessionOutput.trim()) {
      return tailTextLines(this.sessionOutput, maxLines);
    }
    return this.readLatestSessionLogTail(maxLines);
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
    const pid = this.activeCapture?.pid;
    if (this.activeCapture) {
      try {
        this.activeCapture.kill();
      } catch {
        /* ignore */
      }
      this.activeCapture = null;
    }
    if (pid) {
      killProcessTree(pid);
    }
  }

  private async extractSteamCmdWindowsArchive(archivePath: string, destDir: string): Promise<void> {
    const zipArg = archivePath.replace(/'/g, "''");
    const destArg = destDir.replace(/'/g, "''");
    try {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipArg}' -DestinationPath '${destArg}' -Force"`,
        { stdio: "pipe" }
      );
    } catch (err) {
      throw new Error(`解压 SteamCMD 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async extractSteamCmdLinuxArchive(archivePath: string, destDir: string): Promise<void> {
    const tarArg = archivePath.replace(/'/g, "'\\''");
    const destArg = destDir.replace(/'/g, "'\\''");
    try {
      execSync(`tar -xzf '${tarArg}' -C '${destArg}'`, { stdio: "pipe" });
    } catch (err) {
      throw new Error(`解压 SteamCMD 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function formatSessionLogStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function tailTextLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return lines.join("\n").trimEnd();
  }
  return lines.slice(-maxLines).join("\n").trimEnd();
}
