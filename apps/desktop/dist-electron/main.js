import { app as n, nativeTheme as g, dialog as v, ipcMain as l, shell as I, BrowserWindow as N, nativeImage as x, Tray as _, Menu as C } from "electron";
import { spawn as O } from "child_process";
import R from "http";
import r from "path";
import c from "fs";
import { fileURLToPath as $ } from "url";
const j = r.dirname($(import.meta.url)), h = !n.isPackaged, p = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: !1
};
let i = null, f = null, o = null, u = null;
function w() {
  return r.join(n.getPath("userData"), "service-settings.json");
}
function S() {
  return r.join(n.getPath("userData"), "a3st-data");
}
function T() {
  try {
    const t = c.readFileSync(w(), "utf-8"), e = JSON.parse(t);
    return {
      port: e.port ?? p.port,
      host: e.host ?? p.host,
      apiToken: e.apiToken ?? p.apiToken,
      remoteAccessEnabled: e.remoteAccessEnabled ?? p.remoteAccessEnabled
    };
  } catch {
    return { ...p };
  }
}
function U(t) {
  c.mkdirSync(r.dirname(w()), { recursive: !0 }), c.writeFileSync(w(), JSON.stringify(t, null, 2), "utf-8");
}
function k() {
  return h ? r.resolve(n.getAppPath(), "..", "..") : r.dirname(n.getPath("exe"));
}
function P() {
  return h ? r.join(k(), "packages", "service") : r.join(process.resourcesPath, "service");
}
function B() {
  return r.join(P(), "dist", "index.js");
}
function E() {
  return h ? r.join(k(), "packages", "web", "dist", "index.html") : r.join(process.resourcesPath, "web", "index.html");
}
function L() {
  return r.join(process.resourcesPath, "web");
}
function M(t, e) {
  const s = Date.now() + e;
  return new Promise((a) => {
    const d = () => {
      if (Date.now() > s) {
        a(!1);
        return;
      }
      const m = R.get(`http://127.0.0.1:${t}/api/v1/health`, (y) => {
        if (y.resume(), y.statusCode === 200) {
          a(!0);
          return;
        }
        setTimeout(d, 250);
      });
      m.on("error", () => {
        setTimeout(d, 250);
      }), m.setTimeout(1500, () => {
        m.destroy();
      });
    };
    d();
  });
}
function q() {
  return h ? r.join(k(), "apps", "desktop", "build", "icon.ico") : r.join(process.resourcesPath, "assets", "icon.ico");
}
function H() {
  const t = [
    r.join(j, "preload.cjs"),
    r.join(j, "preload.js"),
    r.join(n.getAppPath(), "dist-electron", "preload.cjs"),
    r.join(n.getAppPath(), "dist-electron", "preload.js")
  ];
  for (const e of t) {
    const s = e.includes("app.asar") ? e.replace("app.asar", "app.asar.unpacked") : e;
    if (c.existsSync(s))
      return s;
    if (c.existsSync(e))
      return e;
  }
  return console.error("Preload script not found. Tried:", t.join(" | ")), t[0];
}
function z(t) {
  const e = T(), s = e.remoteAccessEnabled ? "0.0.0.0" : e.host, a = S();
  c.mkdirSync(a, { recursive: !0 });
  const d = {
    ...process.env,
    PORT: String(e.port),
    HOST: s,
    DATA_DIR: a,
    API_TOKEN: e.apiToken
  };
  return h || (d.WEB_ROOT = L()), h ? {
    executable: "node",
    args: [t],
    cwd: P(),
    env: d
  } : {
    executable: process.execPath,
    args: [t],
    cwd: P(),
    env: {
      ...d,
      ELECTRON_RUN_AS_NODE: "1"
    }
  };
}
function D() {
  b();
  const t = B();
  if (!c.existsSync(t)) {
    console.warn(`Node service entry not found: ${t}`), v.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。

请先执行：
npm run build:service

路径：${t}`
    );
    return;
  }
  const e = z(t);
  console.log(`Starting Node service: ${e.executable} ${e.args.join(" ")}`);
  const s = r.join(S(), "service.log");
  f = c.openSync(s, "a"), i = O(e.executable, e.args, {
    cwd: e.cwd,
    env: e.env,
    stdio: ["ignore", f, f],
    windowsHide: !0
  }), i.on("exit", (a) => {
    console.log(`Node service exited with code ${a}`), i = null;
  }), i.on("error", (a) => {
    console.error("Node service process error:", a), i = null;
  });
}
function b() {
  i && !i.killed && (console.log("Stopping Node service..."), i.kill(), i = null), f !== null && (c.closeSync(f), f = null);
}
function A() {
  return i && i.pid && !i.killed ? { running: !0, pid: i.pid } : { running: !1 };
}
function F() {
  return g.shouldUseDarkColors ? "#1e1e1e" : "#ffffff";
}
function J() {
  o && (o.setBackgroundColor(F()), o.webContents.send("theme:changed", g.shouldUseDarkColors));
}
function G() {
  l.handle("theme:shouldUseDarkColors", () => g.shouldUseDarkColors), l.handle("service:status", () => A()), l.handle("service:settings:get", () => T()), l.handle("service:settings:save", (t, e) => {
    const s = {
      port: e.port ?? p.port,
      host: e.host ?? p.host,
      apiToken: e.apiToken ?? "",
      remoteAccessEnabled: !!e.remoteAccessEnabled
    };
    U(s);
  }), l.handle("service:restart", () => (D(), A())), l.handle("app:version", () => n.getVersion()), l.handle("app:path", () => n.getAppPath()), l.handle("shell:openPath", (t, e) => I.openPath(e)), l.handle("dialog:openFile", async (t, e) => await v.showOpenDialog(e)), l.handle("fs:readTextFile", (t, e) => c.readFileSync(e, "utf-8"));
}
function K() {
  const t = H();
  if (console.log(`Using preload: ${t}`), o = new N({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    backgroundColor: F(),
    webPreferences: {
      preload: t,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    },
    show: !1
  }), o.webContents.on("preload-error", (e, s, a) => {
    console.error(`Preload failed (${s}):`, a);
  }), o.on("ready-to-show", () => {
    o == null || o.show();
  }), o.on("close", (e) => {
    u && (e.preventDefault(), o == null || o.hide());
  }), h) {
    o.loadURL("http://localhost:5173").catch((e) => {
      console.error("Failed to load dev server:", e), o == null || o.loadFile(E());
    });
    return;
  }
  o.loadFile(E());
}
function V() {
  const t = q();
  let e;
  c.existsSync(t) ? e = x.createFromPath(t) : e = x.createEmpty(), u = new _(e), u.setToolTip("Arma3 Server Tools");
  const s = C.buildFromTemplate([
    { label: "显示窗口", click: () => o == null ? void 0 : o.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        b(), u == null || u.destroy(), u = null, n.exit();
      }
    }
  ]);
  u.setContextMenu(s), u.on("double-click", () => o == null ? void 0 : o.show());
}
function Q() {
  const t = n.getPath("exe");
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(t) ? (v.showErrorBox(
    "安装路径错误",
    `安装路径包含中文字符，可能导致运行异常。

当前路径：${t}

请重新安装到不含中文的目录。`
  ), !1) : !0;
}
const X = n.requestSingleInstanceLock();
X ? (n.on("second-instance", () => {
  o && (o.isMinimized() && o.restore(), o.show(), o.focus());
}), n.whenReady().then(async () => {
  if (!Q()) {
    n.quit();
    return;
  }
  G(), g.themeSource = "system", g.on("updated", J), D();
  const t = T();
  await M(t.port, 2e4) || v.showErrorBox(
    "服务未就绪",
    `本机被控服务未能响应 http://127.0.0.1:${t.port}/api/v1/health。

日志：${r.join(S(), "service.log")}`
  ), K(), V();
}), n.on("before-quit", () => {
  b();
}), n.on("window-all-closed", () => {
}), n.on("activate", () => {
  o && o.show();
})) : n.quit();
