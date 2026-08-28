import { app as n, nativeTheme as h, dialog as g, ipcMain as c, shell as E, BrowserWindow as A, nativeImage as w, Tray as j, Menu as D } from "electron";
import { spawn as N } from "child_process";
import s from "path";
import u from "fs";
const d = !n.isPackaged, l = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: !1
};
let r = null, t = null, a = null;
function p() {
  return s.join(n.getPath("userData"), "service-settings.json");
}
function F() {
  return s.join(n.getPath("userData"), "a3st-data");
}
function T() {
  try {
    const o = u.readFileSync(p(), "utf-8"), e = JSON.parse(o);
    return {
      port: e.port ?? l.port,
      host: e.host ?? l.host,
      apiToken: e.apiToken ?? l.apiToken,
      remoteAccessEnabled: e.remoteAccessEnabled ?? l.remoteAccessEnabled
    };
  } catch {
    return { ...l };
  }
}
function I(o) {
  u.mkdirSync(s.dirname(p()), { recursive: !0 }), u.writeFileSync(p(), JSON.stringify(o, null, 2), "utf-8");
}
function v() {
  return d ? s.resolve(n.getAppPath(), "..", "..") : s.dirname(n.getPath("exe"));
}
function f() {
  return d ? s.join(v(), "packages", "service") : s.join(process.resourcesPath, "service");
}
function C() {
  return s.join(f(), "dist", "index.js");
}
function P() {
  return d ? s.join(v(), "packages", "web", "dist", "index.html") : s.join(process.resourcesPath, "web", "index.html");
}
function O() {
  return d ? s.join(v(), "apps", "desktop", "build", "icon.ico") : s.join(process.resourcesPath, "assets", "icon.ico");
}
function _() {
  return s.join(n.getAppPath(), "dist-electron", "preload.js");
}
function R(o) {
  const e = T(), i = e.remoteAccessEnabled ? "0.0.0.0" : e.host, S = F();
  u.mkdirSync(S, { recursive: !0 });
  const k = {
    ...process.env,
    PORT: String(e.port),
    HOST: i,
    DATA_DIR: S,
    API_TOKEN: e.apiToken
  };
  return d ? {
    executable: "node",
    args: [o],
    cwd: f(),
    env: k
  } : {
    executable: process.execPath,
    args: [o],
    cwd: f(),
    env: {
      ...k,
      ELECTRON_RUN_AS_NODE: "1"
    }
  };
}
function x() {
  m();
  const o = C();
  if (!u.existsSync(o)) {
    console.warn(`Node service entry not found: ${o}`), g.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。

请先执行：
npm run build:service

路径：${o}`
    );
    return;
  }
  const e = R(o);
  console.log(`Starting Node service: ${e.executable} ${e.args.join(" ")}`), r = N(e.executable, e.args, {
    cwd: e.cwd,
    env: e.env,
    stdio: "ignore",
    windowsHide: !0
  }), r.on("exit", (i) => {
    console.log(`Node service exited with code ${i}`), r = null;
  }), r.on("error", (i) => {
    console.error("Node service process error:", i), r = null;
  });
}
function m() {
  r && !r.killed && (console.log("Stopping Node service..."), r.kill(), r = null);
}
function b() {
  return r && r.pid && !r.killed ? { running: !0, pid: r.pid } : { running: !1 };
}
function y() {
  return h.shouldUseDarkColors ? "#1e1e1e" : "#ffffff";
}
function U() {
  t && (t.setBackgroundColor(y()), t.webContents.send("theme:changed", h.shouldUseDarkColors));
}
function $() {
  c.handle("theme:shouldUseDarkColors", () => h.shouldUseDarkColors), c.handle("service:status", () => b()), c.handle("service:settings:get", () => T()), c.handle("service:settings:save", (o, e) => {
    const i = {
      port: e.port ?? l.port,
      host: e.host ?? l.host,
      apiToken: e.apiToken ?? "",
      remoteAccessEnabled: !!e.remoteAccessEnabled
    };
    I(i);
  }), c.handle("service:restart", () => (x(), b())), c.handle("app:version", () => n.getVersion()), c.handle("app:path", () => n.getAppPath()), c.handle("shell:openPath", (o, e) => E.openPath(e)), c.handle("dialog:openFile", async (o, e) => await g.showOpenDialog(e)), c.handle("fs:readTextFile", (o, e) => u.readFileSync(e, "utf-8"));
}
function B() {
  t = new A({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    backgroundColor: y(),
    webPreferences: {
      preload: _(),
      contextIsolation: !0,
      nodeIntegration: !1
    },
    show: !1
  }), t.on("ready-to-show", () => {
    t == null || t.show();
  }), t.on("close", (o) => {
    a && (o.preventDefault(), t == null || t.hide());
  }), d ? t.loadURL("http://localhost:5173").catch((o) => {
    console.error("Failed to load dev server:", o), t == null || t.loadFile(P());
  }) : t.loadFile(P());
}
function L() {
  const o = O();
  let e;
  u.existsSync(o) ? e = w.createFromPath(o) : e = w.createEmpty(), a = new j(e), a.setToolTip("Arma3 Server Tools");
  const i = D.buildFromTemplate([
    { label: "显示窗口", click: () => t == null ? void 0 : t.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        m(), a == null || a.destroy(), a = null, n.exit();
      }
    }
  ]);
  a.setContextMenu(i), a.on("double-click", () => t == null ? void 0 : t.show());
}
function M() {
  const o = n.getPath("exe");
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(o) ? (g.showErrorBox(
    "安装路径错误",
    `安装路径包含中文字符，可能导致运行异常。

当前路径：${o}

请重新安装到不含中文的目录。`
  ), !1) : !0;
}
const q = n.requestSingleInstanceLock();
q ? (n.on("second-instance", () => {
  t && (t.isMinimized() && t.restore(), t.show(), t.focus());
}), n.whenReady().then(() => {
  if (!M()) {
    n.quit();
    return;
  }
  $(), h.themeSource = "system", h.on("updated", U), x(), B(), L();
}), n.on("before-quit", () => {
  m();
}), n.on("window-all-closed", () => {
}), n.on("activate", () => {
  t && t.show();
})) : n.quit();
