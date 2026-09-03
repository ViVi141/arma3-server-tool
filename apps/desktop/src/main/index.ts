import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell, nativeTheme } from "electron";
import { spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

export interface ServiceSettings {
  port: number;
  host: string;
  apiToken: string;
  remoteAccessEnabled: boolean;
}

const DEFAULT_SETTINGS: ServiceSettings = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: false,
};

let serviceProcess: ChildProcess | null = null;
let serviceLogFd: number | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function settingsPath(): string {
  return path.join(app.getPath("userData"), "service-settings.json");
}

function dataDir(): string {
  return path.join(app.getPath("userData"), "a3st-data");
}

function loadSettings(): ServiceSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ServiceSettings>;
    return {
      port: parsed.port ?? DEFAULT_SETTINGS.port,
      host: parsed.host ?? DEFAULT_SETTINGS.host,
      apiToken: parsed.apiToken ?? DEFAULT_SETTINGS.apiToken,
      remoteAccessEnabled: parsed.remoteAccessEnabled ?? DEFAULT_SETTINGS.remoteAccessEnabled,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: ServiceSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

function repoRoot(): string {
  if (isDev) {
    return path.resolve(app.getAppPath(), "..", "..");
  }
  return path.dirname(app.getPath("exe"));
}

function getServiceRoot(): string {
  if (isDev) {
    return path.join(repoRoot(), "packages", "service");
  }
  return path.join(process.resourcesPath, "service");
}

function getServiceEntryPath(): string {
  return path.join(getServiceRoot(), "dist", "index.js");
}

function getWebIndexPath(): string {
  if (isDev) {
    return path.join(repoRoot(), "packages", "web", "dist", "index.html");
  }
  return path.join(process.resourcesPath, "web", "index.html");
}

function getPackagedWebRoot(): string {
  return path.join(process.resourcesPath, "web");
}

function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        resolve(false);
        return;
      }
      const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
          return;
        }
        setTimeout(attempt, 250);
      });
      req.on("error", () => {
        setTimeout(attempt, 250);
      });
      req.setTimeout(1500, () => {
        req.destroy();
      });
    };
    attempt();
  });
}

function getTrayIconPath(): string {
  if (isDev) {
    return path.join(repoRoot(), "apps", "desktop", "build", "icon.ico");
  }
  return path.join(process.resourcesPath, "assets", "icon.ico");
}

function getPreloadPath(): string {
  // Prefer sibling of main.js (works in asar and asar.unpacked).
  const candidates = [
    path.join(MAIN_DIR, "preload.cjs"),
    path.join(MAIN_DIR, "preload.js"),
    path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
    path.join(app.getAppPath(), "dist-electron", "preload.js"),
  ];
  for (const candidate of candidates) {
    const unpacked = candidate.includes("app.asar")
      ? candidate.replace("app.asar", "app.asar.unpacked")
      : candidate;
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  console.error("Preload script not found. Tried:", candidates.join(" | "));
  return candidates[0];
}

function buildServiceSpawnOptions(entry: string): {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const settings = loadSettings();
  const host = settings.remoteAccessEnabled ? "0.0.0.0" : settings.host;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(settings.port),
    HOST: host,
    DATA_DIR: dir,
    API_TOKEN: settings.apiToken,
  };
  if (!isDev) {
    baseEnv.WEB_ROOT = getPackagedWebRoot();
  }

  if (isDev) {
    return {
      executable: "node",
      args: [entry],
      cwd: getServiceRoot(),
      env: baseEnv,
    };
  }

  return {
    executable: process.execPath,
    args: [entry],
    cwd: getServiceRoot(),
    env: {
      ...baseEnv,
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

function startService(): void {
  stopService();

  const entry = getServiceEntryPath();
  if (!fs.existsSync(entry)) {
    console.warn(`Node service entry not found: ${entry}`);
    dialog.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。\n\n请先执行：\nnpm run build:service\n\n路径：${entry}`
    );
    return;
  }

  const spawnOptions = buildServiceSpawnOptions(entry);
  console.log(`Starting Node service: ${spawnOptions.executable} ${spawnOptions.args.join(" ")}`);

  const logPath = path.join(dataDir(), "service.log");
  serviceLogFd = fs.openSync(logPath, "a");

  serviceProcess = spawn(spawnOptions.executable, spawnOptions.args, {
    cwd: spawnOptions.cwd,
    env: spawnOptions.env,
    stdio: ["ignore", serviceLogFd, serviceLogFd],
    windowsHide: true,
  });

  serviceProcess.on("exit", (code) => {
    console.log(`Node service exited with code ${code}`);
    serviceProcess = null;
  });

  serviceProcess.on("error", (err) => {
    console.error("Node service process error:", err);
    serviceProcess = null;
  });
}

function stopService(): void {
  if (serviceProcess && !serviceProcess.killed) {
    console.log("Stopping Node service...");
    serviceProcess.kill();
    serviceProcess = null;
  }
  if (serviceLogFd !== null) {
    fs.closeSync(serviceLogFd);
    serviceLogFd = null;
  }
}

function getServiceStatus(): { running: boolean; pid?: number } {
  if (serviceProcess && serviceProcess.pid && !serviceProcess.killed) {
    return { running: true, pid: serviceProcess.pid };
  }
  return { running: false };
}

function themeBackgroundColor(): string {
  if (nativeTheme.shouldUseDarkColors) {
    return "#1e1e1e";
  }
  return "#ffffff";
}

function syncWindowTheme(): void {
  if (!mainWindow) {
    return;
  }
  mainWindow.setBackgroundColor(themeBackgroundColor());
  mainWindow.webContents.send("theme:changed", nativeTheme.shouldUseDarkColors);
}

function registerIpcHandlers(): void {
  ipcMain.handle("theme:shouldUseDarkColors", () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle("service:status", () => getServiceStatus());

  ipcMain.handle("service:settings:get", () => loadSettings());

  ipcMain.handle("service:settings:save", (_event, settings: ServiceSettings) => {
    const normalized: ServiceSettings = {
      port: settings.port ?? DEFAULT_SETTINGS.port,
      host: settings.host ?? DEFAULT_SETTINGS.host,
      apiToken: settings.apiToken ?? "",
      remoteAccessEnabled: !!settings.remoteAccessEnabled,
    };
    saveSettings(normalized);
  });

  ipcMain.handle("service:restart", () => {
    startService();
    return getServiceStatus();
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:path", () => app.getAppPath());

  ipcMain.handle("shell:openPath", (_event, targetPath: string) => {
    return shell.openPath(targetPath);
  });

  ipcMain.handle("dialog:openFile", async (_event, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  ipcMain.handle("fs:readTextFile", (_event, filePath: string) => {
    return fs.readFileSync(filePath, "utf-8");
  });
}

function createWindow(): void {
  const preloadPath = getPreloadPath();
  console.log(`Using preload: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    backgroundColor: themeBackgroundColor(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.webContents.on("preload-error", (_event, preloadScriptPath, error) => {
    console.error(`Preload failed (${preloadScriptPath}):`, error);
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173").catch((e) => {
      console.error("Failed to load dev server:", e);
      mainWindow?.loadFile(getWebIndexPath());
    });
    return;
  }

  // file:// + preload：原生选目录 / 被控设置可用。API 仍走 127.0.0.1:19580（CORS 已允许 Origin null）。
  mainWindow.loadFile(getWebIndexPath());
}

function createTray(): void {
  const iconPath = getTrayIconPath();

  let icon: Electron.NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Arma3 Server Tools");
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        stopService();
        tray?.destroy();
        tray = null;
        app.exit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow?.show());
}

function checkInstallPath(): boolean {
  const exePath = app.getPath("exe");
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(exePath)) {
    dialog.showErrorBox(
      "安装路径错误",
      `安装路径包含中文字符，可能导致运行异常。\n\n当前路径：${exePath}\n\n请重新安装到不含中文的目录。`
    );
    return false;
  }
  return true;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!checkInstallPath()) {
      app.quit();
      return;
    }

    registerIpcHandlers();
    nativeTheme.themeSource = "system";
    nativeTheme.on("updated", syncWindowTheme);
    startService();
    const settings = loadSettings();
    const healthy = await waitForHealth(settings.port, 20000);
    if (!healthy) {
      dialog.showErrorBox(
        "服务未就绪",
        `本机被控服务未能响应 http://127.0.0.1:${settings.port}/api/v1/health。\n\n日志：${path.join(dataDir(), "service.log")}`
      );
    }
    createWindow();
    createTray();
  });

  app.on("before-quit", () => {
    stopService();
  });

  app.on("window-all-closed", () => {
    // keep running in tray
  });

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}
