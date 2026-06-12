import { app as r, dialog as m, ipcMain as l, BrowserWindow as x, nativeImage as P, Tray as y, Menu as E } from "electron";
import { spawn as A } from "child_process";
import s from "path";
import u from "fs";
const d = !r.isPackaged, a = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: !1
};
let n = null, e = null, c = null;
function p() {
  return s.join(r.getPath("userData"), "service-settings.json");
}
function j() {
  return s.join(r.getPath("userData"), "a3st-data");
}
function T() {
  try {
    const o = u.readFileSync(p(), "utf-8"), t = JSON.parse(o);
    return {
      port: t.port ?? a.port,
      host: t.host ?? a.host,
      apiToken: t.apiToken ?? a.apiToken,
      remoteAccessEnabled: t.remoteAccessEnabled ?? a.remoteAccessEnabled
    };
  } catch {
    return { ...a };
  }
}
function N(o) {
  u.mkdirSync(s.dirname(p()), { recursive: !0 }), u.writeFileSync(p(), JSON.stringify(o, null, 2), "utf-8");
}
function f() {
  return d ? s.resolve(r.getAppPath(), "..", "..") : s.dirname(r.getPath("exe"));
}
function h() {
  return d ? s.join(f(), "packages", "service") : s.join(process.resourcesPath, "service");
}
function I() {
  return s.join(h(), "dist", "index.js");
}
function b() {
  return d ? s.join(f(), "packages", "web", "dist", "index.html") : s.join(process.resourcesPath, "web", "index.html");
}
function D() {
  return d ? s.join(f(), "apps", "desktop", "build", "icon.ico") : s.join(process.resourcesPath, "assets", "icon.ico");
}
function O() {
  return s.join(r.getAppPath(), "dist-electron", "preload.js");
}
function F(o) {
  const t = T(), i = t.remoteAccessEnabled ? "0.0.0.0" : t.host, v = j();
  u.mkdirSync(v, { recursive: !0 });
  const S = {
    ...process.env,
    PORT: String(t.port),
    HOST: i,
    DATA_DIR: v,
    API_TOKEN: t.apiToken
  };
  return d ? {
    executable: "node",
    args: [o],
    cwd: h(),
    env: S
  } : {
    executable: process.execPath,
    args: [o],
    cwd: h(),
    env: {
      ...S,
      ELECTRON_RUN_AS_NODE: "1"
    }
  };
}
function k() {
  g();
  const o = I();
  if (!u.existsSync(o)) {
    console.warn(`Node service entry not found: ${o}`), m.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。

请先执行：
npm run build:service

路径：${o}`
    );
    return;
  }
  const t = F(o);
  console.log(`Starting Node service: ${t.executable} ${t.args.join(" ")}`), n = A(t.executable, t.args, {
    cwd: t.cwd,
    env: t.env,
    stdio: "ignore",
    windowsHide: !0
  }), n.on("exit", (i) => {
    console.log(`Node service exited with code ${i}`), n = null;
  }), n.on("error", (i) => {
    console.error("Node service process error:", i), n = null;
  });
}
function g() {
  n && !n.killed && (console.log("Stopping Node service..."), n.kill(), n = null);
}
function w() {
  return n && n.pid && !n.killed ? { running: !0, pid: n.pid } : { running: !1 };
}
function R() {
  l.handle("service:status", () => w()), l.handle("service:settings:get", () => T()), l.handle("service:settings:save", (o, t) => {
    const i = {
      port: t.port ?? a.port,
      host: t.host ?? a.host,
      apiToken: t.apiToken ?? "",
      remoteAccessEnabled: !!t.remoteAccessEnabled
    };
    N(i);
  }), l.handle("service:restart", () => (k(), w())), l.handle("app:version", () => r.getVersion()), l.handle("app:path", () => r.getAppPath());
}
function _() {
  e = new x({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    webPreferences: {
      preload: O(),
      contextIsolation: !0,
      nodeIntegration: !1
    },
    show: !1
  }), e.on("ready-to-show", () => {
    e == null || e.show();
  }), e.on("close", (o) => {
    c && (o.preventDefault(), e == null || e.hide());
  }), d ? e.loadURL("http://localhost:5173").catch((o) => {
    console.error("Failed to load dev server:", o), e == null || e.loadFile(b());
  }) : e.loadFile(b());
}
function $() {
  const o = D();
  let t;
  u.existsSync(o) ? t = P.createFromPath(o) : t = P.createEmpty(), c = new y(t), c.setToolTip("Arma3 Server Tools");
  const i = E.buildFromTemplate([
    { label: "显示窗口", click: () => e == null ? void 0 : e.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        g(), c == null || c.destroy(), c = null, r.exit();
      }
    }
  ]);
  c.setContextMenu(i), c.on("double-click", () => e == null ? void 0 : e.show());
}
function L() {
  const o = r.getPath("exe");
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(o) ? (m.showErrorBox(
    "安装路径错误",
    `安装路径包含中文字符，可能导致运行异常。

当前路径：${o}

请重新安装到不含中文的目录。`
  ), !1) : !0;
}
const M = r.requestSingleInstanceLock();
M ? (r.on("second-instance", () => {
  e && (e.isMinimized() && e.restore(), e.show(), e.focus());
}), r.whenReady().then(() => {
  if (!L()) {
    r.quit();
    return;
  }
  R(), k(), _(), $();
}), r.on("before-quit", () => {
  g();
}), r.on("window-all-closed", () => {
}), r.on("activate", () => {
  e && e.show();
})) : r.quit();
