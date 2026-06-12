import { spawn, execSync, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { finished } from "node:stream/promises";
import { EventEmitter } from "node:events";

const STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
const STEAMCMD_ZIP = "steamcmd.zip";
const STEAMCMD_EXE = "steamcmd.exe";
const BOOTSTRAP_MARKER = path.join("public", "steambootstrapper_english.txt");
const APP_ID_ARMA3_SERVER = "233780";

export interface SteamCmdOptions {
  installDir: string;
  username?: string;
  password?: string;
}

export class SteamCmdManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private installDir: string;
  private _username = "";
  private _password = "";
  private _workshopRoot = "";
  private _serverInstallPath = "";

  constructor(installDir: string) {
    super();
    this.installDir = installDir;
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
    return this.process !== null && !this.process.killed;
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
    await new Promise<void>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.process = null;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      this.process = spawn(exePath, ["+quit"], { cwd: this.installDir, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const onData = (data: Buffer) => {
        const text = data.toString();
        output += text;
        this.emit("output", text);
      };
      this.process.stdout?.on("data", onData);
      this.process.stderr?.on("data", onData);
      this.process.on("error", (err) => finish(err));
      this.process.on("exit", () => {
        if (this.isInstalled) {
          this.emit("complete", output);
          finish();
          return;
        }
        finish(new Error(`SteamCMD 初始化未完成\n${output.slice(-500)}`));
      });

      timeoutHandle = setTimeout(() => {
        this.kill();
        if (this.isInstalled) {
          finish();
          return;
        }
        finish(new Error("SteamCMD 初始化超时，请检查网络连接。"));
      }, timeoutMs);
    });
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
      args.push("+workshop_download_item", APP_ID_ARMA3_SERVER, String(id));
    }
    args.push("+quit");
    return this.runSteamCmd(args, onOutput);
  }

  /** 运行 SteamCMD 命令 */
  private async runSteamCmd(
    customArgs: string[],
    onOutput?: (line: string) => void,
    retryCount = 0
  ): Promise<void> {
    const args: string[] = [];
    if (this._username && this._password) {
      args.push("+login", this._username, this._password);
    } else {
      args.push("+login", "anonymous");
    }
    args.push(...customArgs);

    const exePath = path.join(this.installDir, STEAMCMD_EXE);
    return new Promise((resolve, reject) => {
      this.process = spawn(exePath, args, { cwd: this.installDir, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const onData = (data: Buffer) => {
        const text = data.toString();
        output += text;
        this.emit("output", text);
        onOutput?.(text);
      };
      this.process!.stdout?.on("data", onData);
      this.process!.stderr?.on("data", onData);
      this.process!.on("exit", (code) => {
        this.process = null;
        if (code === 0 || this.isSteamCmdOutputSuccess(output, customArgs)) {
          this.emit("complete", output);
          resolve();
          return;
        }
        if (retryCount < 1 && this.shouldRetrySteamCmd(code, output)) {
          this.emit("output", "[提示] SteamCMD 自更新完成，正在重试...\n");
          setTimeout(() => {
            this.runSteamCmd(customArgs, onOutput, retryCount + 1).then(resolve).catch(reject);
          }, 2000);
          return;
        }
        reject(new Error(`SteamCMD 退出代码: ${code}\n${output.slice(-500)}`));
      });
      this.process!.on("error", (err) => {
        this.process = null;
        reject(err);
      });
    });
  }

  private isSteamCmdOutputSuccess(output: string, customArgs: string[]): boolean {
    if (/Success!\s+App\s+['"]233780['"]/i.test(output)) {
      return true;
    }
    const isAppUpdate = customArgs.includes("+app_update");
    if (isAppUpdate && /fully installed|already up to date/i.test(output)) {
      return true;
    }
    return false;
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
    const logDir = path.join(this.installDir, "logs");
    if (!fs.existsSync(logDir)) return "";
    const files = fs.readdirSync(logDir).filter((f) => f.startsWith("steamcmd_")).sort().reverse();
    if (files.length === 0) return "";
    const content = fs.readFileSync(path.join(logDir, files[0]), "utf-8");
    return content.split("\n").slice(-maxLines).join("\n");
  }

  kill(): void {
    if (this.process) {
      try { execSync(`taskkill /PID ${this.process.pid} /T /F 2>nul`, { stdio: "ignore" }); }
      catch { this.process.kill(); }
      this.process = null;
    }
  }
}
