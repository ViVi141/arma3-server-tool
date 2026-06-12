import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { finished } from "node:stream/promises";
import { EventEmitter } from "node:events";
import { spawnConsoleCapture, type ConsoleCaptureHandle } from "./console-capture.js";

const STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
const STEAMCMD_ZIP = "steamcmd.zip";
const STEAMCMD_EXE = "steamcmd.exe";
const BOOTSTRAP_MARKER = path.join("public", "steambootstrapper_english.txt");
const APP_ID_ARMA3_SERVER = "233780";
const APP_ID_ARMA3_GAME = "107410";
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
  args: string[];
}

export class SteamCmdManager extends EventEmitter {
  private activeCapture: ConsoleCaptureHandle | null = null;
  private installDir: string;
  private sessionLogDir: string;
  private _username = "";
  private _password = "";
  private _workshopRoot = "";
  private _serverInstallPath = "";
  private sessionOutput = "";
  private latestSessionLogPath = "";

  constructor(installDir: string) {
    super();
    this.installDir = installDir;
    this.sessionLogDir = path.join(installDir, "logs", "steamcmd");
    fs.mkdirSync(this.sessionLogDir, { recursive: true });
  }

  setCredentials(username: string, password: string): void {
    this._username = username;
    this._password = password;
  }

  setWorkshopRoot(workshopRoot: string): void {
    this._workshopRoot = workshopRoot.trim();
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
    const exePath = path.join(this.installDir, STEAMCMD_EXE);
    const bootstrapPath = path.join(this.installDir, BOOTSTRAP_MARKER);
    return fs.existsSync(exePath) && fs.existsSync(bootstrapPath);
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
    const zipPath = path.join(this.installDir, STEAMCMD_ZIP);
    const response = await fetch(STEAMCMD_URL);
    if (!response.ok || !response.body) {
      throw new Error(`下载 SteamCMD 失败: HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const writer = fs.createWriteStream(zipPath);
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
    const zipArg = zipPath.replace(/'/g, "''");
    const destArg = this.installDir.replace(/'/g, "''");
    try {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipArg}' -DestinationPath '${destArg}' -Force"`,
        { stdio: "pipe" }
      );
    } catch (err) {
      throw new Error(`解压 SteamCMD 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!fs.existsSync(path.join(this.installDir, STEAMCMD_EXE))) {
      throw new Error("解压完成但未找到 steamcmd.exe，请检查网络或手动下载 SteamCMD。");
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
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
    const exePath = path.join(this.installDir, STEAMCMD_EXE);
    let output = "";
    const timer = setTimeout(() => {
      this.kill();
    }, timeoutMs);

    try {
      this.sessionOutput = "";
      const exitCode = await this.runCapturedProcess(exePath, ["+quit"], (chunk) => {
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
    const installDir = serverDir ?? this.installDir;
    return this.runSteamCmd([
      "+force_install_dir", installDir,
      "+app_update", APP_ID_ARMA3_SERVER, "validate",
      "+quit",
    ], onOutput);
  }

  /** 下载 Workshop 模组 */
  async downloadWorkshopMods(modIds: number[], onOutput?: (line: string) => void): Promise<void> {
    await this.ensureInstalled();
    const installDir = this._workshopRoot || this.installDir;
    const args: string[] = [
      "+force_install_dir", installDir,
    ];
    for (const id of modIds) {
      args.push("+workshop_download_item", APP_ID_ARMA3_GAME, String(id));
    }
    args.push("+quit");
    return this.runSteamCmd(args, onOutput);
  }

  /** 通过 ConPTY（Windows）捕获与 CMD 黑窗一致的控制台输出 */
  private async runSteamCmd(
    customArgs: string[],
    onOutput?: (line: string) => void,
    retryCount = 0
  ): Promise<void> {
    if (this.activeCapture !== null) {
      throw new Error("SteamCMD 进程已在运行，请等待当前任务完成");
    }

    const args: string[] = [];
    
    const forceInstallDirIdx = customArgs.indexOf("+force_install_dir");
    if (forceInstallDirIdx >= 0 && forceInstallDirIdx + 1 < customArgs.length) {
      args.push("+force_install_dir", customArgs[forceInstallDirIdx + 1]);
    }
    
    if (this._username && this._password) {
      args.push("+login", this._username, this._password);
    } else {
      args.push("+login", "anonymous");
    }
    
    for (let i = 0; i < customArgs.length; i++) {
      if (customArgs[i] === "+force_install_dir") {
        i++;
        continue;
      }
      args.push(customArgs[i]);
    }

    const exePath = path.join(this.installDir, STEAMCMD_EXE);
    const sessionLogPath = this.createSessionLogPath();
    this.sessionOutput = "";

    const debugArgs = args.map(arg => arg === this._password ? "***" : arg);
    const debugMsg = `[调试] 参数数组 (${args.length} 项): ${JSON.stringify(debugArgs)}\n`;
    this.appendSessionOutput(debugMsg);
    this.emit("output", debugMsg);

    let combined = "";
    const exitCode = await this.runCapturedProcess(exePath, args, (chunk) => {
      combined += chunk;
      onOutput?.(chunk);
    });

    const captureResult: SessionRunCapture = {
      console: combined,
      exitCode,
      exePath,
      args,
    };
    this.writeSessionLogFile(sessionLogPath, captureResult, customArgs);

    if (exitCode === 0 || this.isSteamCmdOutputSuccess(combined, customArgs)) {
      this.emit("complete", combined);
      return;
    }
    if (retryCount < 1 && this.shouldRetrySteamCmd(exitCode, combined)) {
      const retryHint = "Update complete, launching SteamCMD...\n";
      this.appendSessionOutput(retryHint);
      this.emit("output", retryHint);
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      return this.runSteamCmd(customArgs, onOutput, retryCount + 1);
    }
    throw new Error(`SteamCMD 退出代码: ${exitCode}\n${combined.slice(-500)}`);
  }

  private async runCapturedProcess(
    exePath: string,
    args: string[],
    onChunk: (chunk: string) => void,
  ): Promise<number | null> {
    const capture = await spawnConsoleCapture(
      exePath,
      args,
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
    customArgs: string[],
  ): void {
    const safeArgs = redactPasswordInArgs(capture.args, this._password);
    const success =
      capture.exitCode === 0 ||
      this.isSteamCmdOutputSuccess(capture.console, customArgs);
    const builder: string[] = [
      `时间: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
      `程序: ${capture.exePath}`,
      `参数: ${safeArgs.join(" ")}`,
      `退出码: ${capture.exitCode ?? "null"}`,
      `成功: ${success}`,
      `捕获: ${process.platform === "win32" ? "静默运行 + console_log.txt" : "stdout/stderr 管道"}`,
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

  private isSteamCmdOutputSuccess(output: string, customArgs: string[]): boolean {
    if (/Success!\s+App\s+['"]233780['"]/i.test(output)) {
      return true;
    }
    const isAppUpdate = customArgs.includes("+app_update");
    if (isAppUpdate && /fully installed|already up to date/i.test(output)) {
      return true;
    }
    const isWorkshop = customArgs.includes("+workshop_download_item");
    if (isWorkshop && /Success\.\s+Downloaded item/i.test(output)) {
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
      try {
        execSync(`taskkill /PID ${pid} /T /F 2>nul`, { stdio: "ignore" });
      } catch {
        /* ignore */
      }
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

function redactPasswordInArgs(args: string[], password: string): string[] {
  if (!password) {
    return [...args];
  }
  return args.map((arg) => (arg === password ? "***" : arg));
}
