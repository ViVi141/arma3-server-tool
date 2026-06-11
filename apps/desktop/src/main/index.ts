import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const isDev = !app.isPackaged;

// Service process management
let serviceProcess: ChildProcess | null = null;

function getServiceExePath(): string {
  const base = isDev
    ? path.resolve(app.getAppPath(), "..", "..", "..", "..", "..")
    : path.dirname(app.getPath("exe"));

  // In production, Service.exe sits alongside the Electron exe
  const candidates = [
    path.join(base, "Arma3ServerTools.Service.exe"),
    path.join(base, "Service", "Arma3ServerTools.Service.exe"),
    path.join(base, "agent", "Arma3ServerTools.Agent.Host.exe"), // legacy
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return candidates[0];
}

function getMonitoringHostExePath(): string {
  const base = isDev
    ? path.resolve(app.getAppPath(), "..", "..", "..", "..", "..")
    : path.dirname(app.getPath("exe"));

  const candidates = [
    path.join(base, "monitoring", "Arma3ServerTools.MonitoringHost.exe"),
    path.join(base, "monitoring-host", "Arma3ServerTools.MonitoringHost.exe"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return candidates[0];
}

function startService(): void {
  const exePath = getServiceExePath();
  if (!fs.existsSync(exePath)) {
    console.warn(`Service executable not found at: ${exePath}`);
    return;
  }

  console.log(`Starting Service: ${exePath}`);
  serviceProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    stdio: "ignore",
    windowsHide: true,
  });

  serviceProcess.on("exit", (code) => {
    console.log(`Service exited with code ${code}`);
    serviceProcess = null;
  });

  serviceProcess.on("error", (err) => {
    console.error("Service process error:", err);
    serviceProcess = null;
  });
}

function stopService(): void {
  if (serviceProcess && !serviceProcess.killed) {
    console.log("Stopping Service...");
    serviceProcess.kill();
    serviceProcess = null;
  }
}

// Main window
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
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
      mainWindow?.loadFile(
        path.resolve(app.getAppPath(), "..", "..", "..", "packages", "web", "dist", "index.html")
      );
    });
  } else {
    mainWindow.loadFile(
      path.resolve(app.getAppPath(), "..", "..", "packages", "web", "dist", "index.html")
    );
  }
}

function createTray(): void {
  const iconPath = path.join(
    app.getAppPath(),
    isDev ? "../assets/tray-icon.png" : "assets/tray-icon.png"
  );

  let icon: nativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
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

// Path check (no CJK in install path)
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

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!checkInstallPath()) {
      app.quit();
      return;
    }

    startService();
    createWindow();
    createTray();
  });

  app.on("before-quit", () => {
    stopService();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // keep running in tray
    }
  });

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}
