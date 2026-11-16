import { app as a, Menu as M, nativeTheme as P, dialog as d, ipcMain as f, shell as Q, BrowserWindow as X, nativeImage as L, Tray as Y } from "electron";
import { spawn as Z, execFileSync as T } from "child_process";
import O from "http";
import i from "path";
import c from "fs";
import { fileURLToPath as W } from "url";
const R = i.dirname(W(import.meta.url)), k = !a.isPackaged, y = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: !1
};
let u = null, m = null, S = !1, x = 0, I = !1, g = null, n = null, v = null, F = !1;
function A() {
  return i.join(a.getPath("userData"), "service-settings.json");
}
function b() {
  return i.join(a.getPath("userData"), "a3st-data");
}
function p() {
  try {
    const t = c.readFileSync(A(), "utf-8"), e = JSON.parse(t);
    return {
      port: e.port ?? y.port,
      host: e.host ?? y.host,
      apiToken: e.apiToken ?? y.apiToken,
      remoteAccessEnabled: e.remoteAccessEnabled ?? y.remoteAccessEnabled,
      closeBehavior: e.closeBehavior === "tray" || e.closeBehavior === "quit" ? e.closeBehavior : "ask"
    };
  } catch {
    return { ...y };
  }
}
function _(t) {
  c.mkdirSync(i.dirname(A()), { recursive: !0 }), c.writeFileSync(A(), JSON.stringify(t, null, 2), "utf-8");
}
function U() {
  return k ? i.resolve(a.getAppPath(), "..", "..") : i.dirname(a.getPath("exe"));
}
function D() {
  return k ? i.join(U(), "packages", "service") : i.join(process.resourcesPath, "service");
}
function q() {
  return i.join(D(), "dist", "index.js");
}
function $() {
  return k ? i.join(U(), "packages", "web", "dist", "index.html") : i.join(process.resourcesPath, "web", "index.html");
}
function ee() {
  return i.join(process.resourcesPath, "web");
}
function H(t) {
  return new Promise((e) => {
    let o = !1;
    const r = (l) => {
      o || (o = !0, e(l));
    }, s = O.get(`http://127.0.0.1:${t}/api/v1/health`, (l) => {
      if (l.resume(), l.statusCode !== 200) {
        r("down");
        return;
      }
      const h = O.get(`http://127.0.0.1:${t}/`, (w) => {
        w.resume();
        const E = String(w.headers["content-type"] ?? "");
        if (w.statusCode === 200 && E.includes("text/html")) {
          r("ui");
          return;
        }
        r("api-only");
      });
      h.on("error", () => {
        r("api-only");
      }), h.setTimeout(1500, () => {
        h.destroy(), r("api-only");
      });
    });
    s.on("error", () => {
      r("down");
    }), s.setTimeout(1500, () => {
      s.destroy(), r("down");
    });
  });
}
function G(t) {
  if (process.platform !== "win32") {
    try {
      const e = T("sh", ["-c", `lsof -t -iTCP:${t} -sTCP:LISTEN`], {
        encoding: "utf-8",
        windowsHide: !0,
        stdio: ["ignore", "pipe", "ignore"]
      }), o = parseInt(e.trim().split(/\r?\n/)[0] ?? "", 10);
      if (Number.isFinite(o) && o > 0)
        return o;
    } catch {
      return null;
    }
    return null;
  }
  try {
    const e = T(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${t} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`
      ],
      {
        encoding: "utf-8",
        windowsHide: !0,
        stdio: ["ignore", "pipe", "ignore"]
      }
    ), o = parseInt(e.trim(), 10);
    if (Number.isFinite(o) && o > 0)
      return o;
  } catch {
    return null;
  }
  return null;
}
function te(t) {
  if (!(!t || t <= 0)) {
    if (process.platform === "win32") {
      try {
        T("taskkill", ["/PID", String(t), "/T", "/F"], {
          windowsHide: !0,
          stdio: "ignore"
        });
      } catch (e) {
        console.error(`taskkill ${t} failed:`, e);
      }
      return;
    }
    try {
      process.kill(t, "SIGTERM");
    } catch (e) {
      console.error(`kill ${t} failed:`, e);
    }
  }
}
function z(t) {
  if (!(!t || t <= 0)) {
    if (process.platform === "win32") {
      try {
        T("taskkill", ["/PID", String(t), "/F"], {
          windowsHide: !0,
          stdio: "ignore"
        });
      } catch (e) {
        console.error(`taskkill ${t} failed:`, e);
      }
      return;
    }
    try {
      process.kill(t, "SIGTERM");
    } catch (e) {
      console.error(`kill ${t} failed:`, e);
    }
  }
}
function oe(t) {
  const e = G(t);
  !e || e === process.pid || (g = e, console.log(`Adopted existing listener on port ${t} as PID ${e}`));
}
function re(t) {
  const e = G(t);
  !e || e === process.pid || (console.log(`Freeing port ${t} by stopping listener PID ${e} (children preserved)`), z(e), g === e && (g = null));
}
function ne() {
  const t = i.join(b(), "service.log");
  try {
    const o = c.readFileSync(t, "utf-8").split(/\r?\n/), r = Math.max(0, o.length - 25);
    return o.slice(r).join(`
`).trim();
  } catch {
    return "";
  }
}
async function J(t, e) {
  const o = Date.now() + e;
  for (; Date.now() <= o && !S; ) {
    const r = await H(t);
    if (r !== "down")
      return r;
    await new Promise((s) => setTimeout(s, 250));
  }
  return "down";
}
function se() {
  return k ? i.join(U(), "apps", "desktop", "build", "icon.ico") : i.join(process.resourcesPath, "assets", "icon.ico");
}
function ie() {
  const t = [
    i.join(R, "preload.cjs"),
    i.join(R, "preload.js"),
    i.join(a.getAppPath(), "dist-electron", "preload.cjs"),
    i.join(a.getAppPath(), "dist-electron", "preload.js")
  ];
  for (const e of t) {
    const o = e.includes("app.asar") ? e.replace("app.asar", "app.asar.unpacked") : e;
    if (c.existsSync(o))
      return o;
    if (c.existsSync(e))
      return e;
  }
  return console.error("Preload script not found. Tried:", t.join(" | ")), t[0];
}
function le(t) {
  const e = p(), o = e.remoteAccessEnabled ? "0.0.0.0" : e.host, r = b();
  c.mkdirSync(r, { recursive: !0 });
  const s = {
    ...process.env,
    PORT: String(e.port),
    HOST: o,
    DATA_DIR: r,
    API_TOKEN: e.apiToken
  };
  return k || (s.WEB_ROOT = ee()), k ? {
    executable: "node",
    args: [t],
    cwd: D(),
    env: s
  } : {
    executable: process.execPath,
    args: [t],
    cwd: D(),
    env: {
      ...s,
      ELECTRON_RUN_AS_NODE: "1"
    }
  };
}
function V() {
  N();
  const t = p();
  re(t.port), x += 1;
  const e = x;
  S = !1;
  const o = q();
  if (!c.existsSync(o))
    return console.warn(`Node service entry not found: ${o}`), S = !0, d.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。

请先执行：
npm run build:service

路径：${o}`
    ), !1;
  const r = le(o);
  console.log(`Starting Node service: ${r.executable} ${r.args.join(" ")}`);
  const s = i.join(b(), "service.log");
  m = c.openSync(s, "a");
  const l = Z(r.executable, r.args, {
    cwd: r.cwd,
    env: r.env,
    stdio: ["ignore", m, m],
    windowsHide: !0
  });
  return u = l, l.on("exit", (h) => {
    console.log(`Node service exited with code ${h}`), e === x && (u === l && (u = null), S = !0);
  }), l.on("error", (h) => {
    console.error("Node service process error:", h), e === x && (u === l && (u = null), S = !0);
  }), !0;
}
function N(t = {}) {
  const e = t.killGameServers ? te : z;
  u && u.pid && !u.killed && (console.log(
    `Stopping Node service (PID ${u.pid}, killGameServers=${!!t.killGameServers})...`
  ), e(u.pid), u = null), g && (console.log(`Stopping adopted service PID ${g}...`), e(g), g = null), m !== null && (c.closeSync(m), m = null);
}
function B() {
  return u && u.pid && !u.killed ? { running: !0, pid: u.pid } : g ? { running: !0, pid: g } : { running: !1 };
}
function K() {
  return P.shouldUseDarkColors ? "#1e1e1e" : "#ffffff";
}
function ae() {
  n && (n.setBackgroundColor(K()), n.webContents.send("theme:changed", P.shouldUseDarkColors));
}
function ce() {
  f.handle("theme:shouldUseDarkColors", () => P.shouldUseDarkColors), f.handle("service:status", () => B()), f.handle("service:settings:get", () => p()), f.handle("service:settings:save", (t, e) => {
    const o = p(), r = {
      port: e.port ?? y.port,
      host: e.host ?? y.host,
      apiToken: e.apiToken ?? "",
      remoteAccessEnabled: !!e.remoteAccessEnabled,
      // Preserve tray preference even when the web client posts settings
      // without this field.
      closeBehavior: e.closeBehavior ?? o.closeBehavior ?? "ask"
    };
    _(r);
  }), f.handle("service:restart", async () => {
    if (!V())
      return I = !0, B();
    const e = p();
    return S = !1, I = await J(e.port, 3e4) !== "ui", B();
  }), f.handle("app:version", () => a.getVersion()), f.handle("app:path", () => a.getAppPath()), f.handle("shell:openPath", (t, e) => Q.openPath(e)), f.handle("dialog:openFile", async (t, e) => await d.showOpenDialog(e)), f.handle("fs:readTextFile", (t, e) => c.readFileSync(e, "utf-8"));
}
function ue() {
  const t = ie();
  console.log(`Using preload: ${t}`), n = new X({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    backgroundColor: K(),
    autoHideMenuBar: !0,
    webPreferences: {
      preload: t,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    },
    show: !1
  }), n.setMenuBarVisibility(!1), n.webContents.on("preload-error", (o, r, s) => {
    console.error(`Preload failed (${r}):`, s);
  });
  let e = !1;
  n.webContents.on(
    "did-fail-load",
    (o, r, s, l, h) => {
      if (!h || r === -3 || e || !n)
        return;
      console.error(`UI did-fail-load code=${r} url=${l}: ${s}`), e = !0;
      const w = $();
      if (c.existsSync(w)) {
        console.warn(`Falling back to file UI: ${w}`), n.loadFile(w).catch((E) => {
          console.error("Fallback file UI load failed:", E), d.showErrorBox(
            "界面加载失败",
            `无法加载控制台界面。

错误: ${s}
地址: ${l}

请确认本机服务已启动，或查看 service.log。`
          ), n == null || n.show();
        });
        return;
      }
      d.showErrorBox(
        "界面加载失败",
        `无法加载控制台界面。

错误: ${s}
地址: ${l}`
      ), n.show();
    }
  ), n.webContents.on("render-process-gone", (o, r) => {
    console.error("Renderer gone:", r), d.showErrorBox(
      "界面进程已退出",
      `渲染进程异常（${r.reason}）。将尝试重新加载。`
    ), n && j(n);
  }), n.on("ready-to-show", () => {
    n == null || n.show();
  }), n.on("show", () => {
    if (!n)
      return;
    const o = n.webContents.getURL();
    (!o || o === "about:blank") && j(n);
  }), n.on("close", (o) => {
    const r = n;
    if (F || !v || !r)
      return;
    const s = p().closeBehavior ?? "ask";
    if (s === "quit") {
      o.preventDefault(), C({ ask: !1 });
      return;
    }
    if (s === "tray") {
      o.preventDefault(), n == null || n.hide();
      return;
    }
    o.preventDefault();
    const l = d.showMessageBoxSync(r, {
      type: "question",
      title: "关闭窗口",
      message: "要最小化到托盘还是退出程序？",
      detail: "最小化后后台服务与已启动的游戏服务器继续运行。退出时可选择是否一并停止游戏服务器。也可以在托盘菜单里修改本提醒行为。",
      buttons: ["最小化到托盘", "退出程序", "取消"],
      defaultId: 0,
      cancelId: 2,
      noLink: !0
    });
    l === 0 ? n == null || n.hide() : l === 1 && C({ ask: !0 });
  }), j(n);
}
function j(t) {
  if (k) {
    t.loadURL("http://localhost:5173").catch((r) => {
      console.error("Failed to load dev server:", r), t.loadFile($()).catch((s) => {
        console.error("Failed to load packaged web index:", s);
      });
    });
    return;
  }
  const o = `http://127.0.0.1:${p().port}/`;
  if (I) {
    const r = $();
    if (c.existsSync(r)) {
      console.warn(`Loading file UI because service page is not ready: ${r}`), t.loadFile(r).catch((s) => {
        console.error("file:// UI load failed:", s), d.showErrorBox(
          "界面加载失败",
          `无法打开控制台。
Service: ${o}
file: ${r}`
        ), t.show();
      });
      return;
    }
  }
  console.log(`Loading UI from service: ${o}`), t.loadURL(o).catch((r) => {
    console.error("Service UI load failed:", r);
    const s = $();
    if (c.existsSync(s)) {
      t.loadFile(s).catch((l) => {
        console.error("file:// UI load failed:", l), d.showErrorBox(
          "界面加载失败",
          `无法打开控制台。
Service: ${o}
file: ${s}`
        ), t.show();
      });
      return;
    }
    d.showErrorBox(
      "界面文件缺失",
      `未找到控制台页面，且无法连接 ${o}。
日志：${i.join(b(), "service.log")}`
    ), t.show();
  });
}
function C(t) {
  if (F)
    return;
  let e = !1;
  if (t.ask) {
    const o = {
      type: "question",
      title: "退出程序",
      message: "正在运行的游戏服务器如何处理？",
      detail: "选择“保持运行”时，Arma3 服务器进程将继续运行，下次打开工具会自动接管管理。",
      buttons: ["退出并保持服务器运行", "退出并停止服务器", "取消"],
      defaultId: 0,
      cancelId: 2,
      noLink: !0
    }, r = n ? d.showMessageBoxSync(n, o) : d.showMessageBoxSync(o);
    if (r === 2)
      return;
    e = r === 1;
  }
  F = !0, N({ killGameServers: e }), v == null || v.destroy(), v = null, a.exit(0);
}
function de(t) {
  const e = p();
  e.closeBehavior = t, _(e);
}
function fe() {
  const t = se();
  let e;
  c.existsSync(t) ? e = L.createFromPath(t) : e = L.createEmpty(), v = new Y(e), v.setToolTip("Arma3 Server Tools");
  const o = p().closeBehavior ?? "ask", r = M.buildFromTemplate([
    { label: "显示窗口", click: () => n == null ? void 0 : n.show() },
    { type: "separator" },
    {
      label: "点击关闭按钮时",
      submenu: [
        { value: "ask", label: "每次询问" },
        { value: "tray", label: "最小化到托盘" },
        { value: "quit", label: "退出程序" }
      ].map((s) => ({
        label: s.label,
        type: "radio",
        checked: o === s.value,
        click: () => de(s.value)
      }))
    },
    { type: "separator" },
    {
      label: "退出…",
      click: () => C({ ask: !0 })
    }
  ]);
  v.setContextMenu(r), v.on("double-click", () => n == null ? void 0 : n.show());
}
function pe() {
  const t = a.getPath("exe");
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(t) ? (d.showErrorBox(
    "安装路径错误",
    `安装路径包含中文字符，可能导致运行异常。

当前路径：${t}

请重新安装到不含中文的目录。`
  ), !1) : !0;
}
const he = a.requestSingleInstanceLock();
he ? (a.on("second-instance", () => {
  n && (n.isMinimized() && n.restore(), n.show(), n.focus());
}), a.whenReady().then(async () => {
  if (!pe()) {
    a.quit();
    return;
  }
  M.setApplicationMenu(null), ce(), P.themeSource = "system", P.on("updated", ae);
  const t = p();
  let e = await H(t.port);
  if (e === "down" ? V() && (e = await J(t.port, 3e4)) : (oe(t.port), console.log(`Reusing service already listening on ${t.port} (${e})`)), I = e !== "ui", e === "down") {
    if (c.existsSync(q())) {
      const r = ne();
      let s = `本机被控服务未能响应 http://127.0.0.1:${t.port}/api/v1/health。

日志：${i.join(b(), "service.log")}`;
      r.length > 0 && (s = `${s}

${r}`), d.showErrorBox("服务未就绪", s);
    }
  } else e === "api-only" && d.showErrorBox(
    "控制台页面未就绪",
    `服务已在 http://127.0.0.1:${t.port}/ 响应，但首页不是控制台页面（常见为 HTTP 404）。
已改用本地界面。若日志中是端口被占用或拒绝访问，可在被控设置里更换端口后重启服务。

日志：${i.join(b(), "service.log")}`
  );
  ue(), fe();
}), a.on("before-quit", () => {
  N();
}), a.on("window-all-closed", () => {
}), a.on("activate", () => {
  n && n.show();
})) : a.quit();
