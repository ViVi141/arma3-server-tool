#!/usr/bin/env node
/**
 * 打包 Linux 便携包（Service + 内置 Web UI）：
 *
 *   artifacts/linux/Arma3ServerTools-linux-<version>.tar.gz
 *
 * 目录结构：
 *   Arma3ServerTools-linux-<version>/
 *     service/        dist + 生产依赖 + runtime package.json
 *     web/            Vite 构建产物（Service 直接托管）
 *     start.sh        一键启动（读取同目录 a3st.env）
 *     a3st.env.example
 *     a3st.service    systemd 单元模板
 *     README.md       部署说明
 *
 * 前置：已运行 `npm run build:service` 与 `npm run build:web`
 * （根目录 `npm run pack:linux` 会自动执行这两步）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const servicePkg = JSON.parse(
  readFileSync(path.join(root, "packages", "service", "package.json"), "utf8")
);
const version = String(rootPkg.version ?? "0.0.0");
const bundleName = `Arma3ServerTools-linux-${version}`;
const outDir = path.join(root, "artifacts", "linux");
const stageRoot = path.join(outDir, "staging");
const bundleDir = path.join(stageRoot, bundleName);
const serviceDist = path.join(root, "packages", "service", "dist");
const webDist = path.join(root, "packages", "web", "dist");

function fail(message) {
  console.error(`\n[pack-linux] ${message}\n`);
  process.exit(1);
}

function writeText(filePath, content, mode) {
  writeFileSync(filePath, content, "utf8");
  if (mode !== undefined) {
    try {
      chmodSync(filePath, mode);
    } catch {
      // Windows 上 chmod 为 no-op；压缩包在 Linux 侧解压后可用 `bash start.sh`
    }
  }
}

if (!existsSync(path.join(serviceDist, "index.js"))) {
  fail("缺少 packages/service/dist/index.js，请先运行 npm run build:service");
}
if (!existsSync(path.join(webDist, "index.html"))) {
  fail("缺少 packages/web/dist/index.html，请先运行 npm run build:web:service");
}
// Service 托管在根路径且路由含多级路径（/console/:id/:tab），必须使用绝对 base，
// 否则刷新深链时相对资源会解析到错误目录。
const webIndex = readFileSync(path.join(webDist, "index.html"), "utf8");
if (!webIndex.includes('src="/assets/')) {
  fail("packages/web/dist 不是 --base / 构建产物，请改用 npm run build:web:service");
}
if (!servicePkg.dependencies || Object.keys(servicePkg.dependencies).length === 0) {
  fail("packages/service/package.json 缺少 dependencies");
}

console.log(`[pack-linux] 准备 ${bundleName}`);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(path.join(bundleDir, "service"), { recursive: true });

// 1. Service dist + 版本与依赖清单（版本以根 package.json 为唯一来源，/health 与 About 页依赖它）
cpSync(serviceDist, path.join(bundleDir, "service", "dist"), { recursive: true });
const runtimePkg = {
  name: "a3st-service-runtime",
  private: true,
  type: "module",
  version,
  main: "./dist/index.js",
  dependencies: servicePkg.dependencies,
};
writeText(
  path.join(bundleDir, "service", "package.json"),
  `${JSON.stringify(runtimePkg, null, 2)}\n`
);

// 2. 生产依赖（当前均为纯 JS / WASM 依赖，可在任意平台安装后随包分发）
console.log("[pack-linux] 安装 Service 生产依赖 ...");
const install = process.platform === "win32"
  ? spawnSync("npm install --omit=dev --no-audit --no-fund", {
      cwd: path.join(bundleDir, "service"),
      stdio: "inherit",
      shell: true,
    })
  : spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
      cwd: path.join(bundleDir, "service"),
      stdio: "inherit",
    });
if (install.error) {
  fail(`无法执行 npm：${install.error.message}`);
}
if (install.status !== 0) {
  fail("Service 生产依赖安装失败");
}
rmSync(path.join(bundleDir, "service", "package-lock.json"), { force: true });
for (const dep of Object.keys(servicePkg.dependencies)) {
  const depPkg = path.join(
    bundleDir,
    "service",
    "node_modules",
    ...dep.split("/"),
    "package.json"
  );
  if (!existsSync(depPkg)) {
    fail(`生产依赖缺失：${dep}`);
  }
}

// 3. Web UI（Service 的 WEB_ROOT 指向此处，默认 base=/ 同源访问）
cpSync(webDist, path.join(bundleDir, "web"), { recursive: true });

// 4. 启动脚本 / 配置模板 / systemd 单元 / 说明
writeText(path.join(bundleDir, "start.sh"), startSh(), 0o755);
writeText(path.join(bundleDir, "a3st.env.example"), envExample());
writeText(path.join(bundleDir, "a3st.service"), systemdUnit());
writeText(path.join(bundleDir, "README.md"), bundleReadme(version));
for (const doc of ["LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.txt"]) {
  const src = path.join(root, doc);
  if (existsSync(src)) {
    cpSync(src, path.join(bundleDir, doc));
  }
}

// 5. 压缩 + 校验和
console.log("[pack-linux] 生成 tar.gz ...");
const tarPath = path.join(outDir, `${bundleName}.tar.gz`);
rmSync(tarPath, { force: true });
const tar = spawnSync("tar", ["-czf", tarPath, "-C", stageRoot, bundleName], {
  stdio: "inherit",
});
if (tar.error) {
  fail(`无法执行 tar（Windows 需自带 bsdtar）：${tar.error.message}`);
}
if (tar.status !== 0) {
  fail("tar 打包失败");
}

const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
const shaPath = `${tarPath}.sha256`;
writeText(shaPath, `${sha256}  ${path.basename(tarPath)}\n`);

const sizeMb = (statSync(tarPath).size / (1024 * 1024)).toFixed(1);
console.log("");
console.log(`[pack-linux] 完成：${tarPath}`);
console.log(`[pack-linux] 大小：${sizeMb} MB`);
console.log(`[pack-linux] SHA256：${sha256}`);
console.log("[pack-linux] 部署：解压后 cp a3st.env.example a3st.env 并填写 API_TOKEN，然后 bash start.sh");

// ---------------------------------------------------------------------------
// 模板（保持 LF，供 Linux 直接使用）
// ---------------------------------------------------------------------------

function startSh() {
  return [
  "#!/usr/bin/env bash",
  "# Arma3 Server Tools - Linux 便携包启动脚本",
  "# 同目录 a3st.env 存在时自动加载；可用 HOST/PORT/API_TOKEN/DATA_DIR 覆盖。",
  "set -euo pipefail",
  "",
  'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  "",
  'if [ -f "$DIR/a3st.env" ]; then',
  "  set -a",
  '  # shellcheck disable=SC1091',
  '  . "$DIR/a3st.env"',
  "  set +a",
  "fi",
  "",
  'export DATA_DIR="${DATA_DIR:-$DIR/data}"',
  'export WEB_ROOT="${WEB_ROOT:-$DIR/web}"',
  'export PORT="${PORT:-19580}"',
  'export HOST="${HOST:-127.0.0.1}"',
  "",
  'mkdir -p "$DATA_DIR"',
  "",
  'case "$HOST" in',
  "  127.0.0.1|localhost|::1)",
  "    ;;",
  "  *)",
  '    if [ -z "${API_TOKEN:-}" ]; then',
  '      echo "错误：HOST=$HOST 属远程监听，必须设置 API_TOKEN。" >&2',
  '      echo "请复制 a3st.env.example 为 a3st.env 并填写 API_TOKEN 后重试。" >&2',
  "      exit 1",
  "    fi",
  "    ;;",
  "esac",
  "",
  'echo "Arma3 Server Tools Service"',
  'echo "  UI/API   : http://$HOST:$PORT/"',
  'echo "  DATA_DIR : $DATA_DIR"',
  'echo "  WEB_ROOT : $WEB_ROOT"',
  'if [ -n "${API_TOKEN:-}" ]; then echo "  API_TOKEN: 已设置"; else echo "  API_TOKEN: 未设置（仅本机访问）"; fi',
  "",
  'exec node "$DIR/service/dist/index.js"',
  "",
  ].join("\n");
}

function envExample() {
  return [
  "# Arma3 Server Tools - Linux 配置（复制为同目录 a3st.env 后修改）",
  "# 该文件会被 start.sh 自动加载；systemd 单元通过 EnvironmentFile 读取。",
  "",
  "# HTTP 监听端口",
  "PORT=19580",
  "# 仅本机/反向代理：127.0.0.1；VPS 直接对外：0.0.0.0",
  "HOST=127.0.0.1",
  "# 非 loopback 监听时必填（留空将拒绝启动）",
  "API_TOKEN=",
  "# 数据目录（统计库/快照/配置包），默认 <包目录>/data",
  "# DATA_DIR=/var/lib/a3st",
  "# Web UI 目录，默认 <包目录>/web（systemd 直接运行时必须显式指定）",
  "# WEB_ROOT=/opt/a3st/web",
  "# 可选：systemd 重启 Service 时保留正在运行的 Arma 服务器（按 PID 收养）",
  "# A3ST_KEEP_SERVERS_ON_STOP=1",
  "# 可选：额外允许的浏览器来源（逗号分隔，反向代理同源时通常不需要）",
  "# A3ST_ALLOWED_ORIGINS=https://a3st.example.com",
  "",
  ].join("\n");
}

function systemdUnit() {
  return [
  "[Unit]",
  "Description=Arma3 Server Tools (Service + Web UI)",
  "After=network-online.target",
  "Wants=network-online.target",
  "",
  "[Service]",
  "Type=simple",
  "User=a3st",
  "Group=a3st",
  "WorkingDirectory=/opt/a3st",
  "EnvironmentFile=/opt/a3st/a3st.env",
  "Environment=WEB_ROOT=/opt/a3st/web",
  "Environment=DATA_DIR=/var/lib/a3st",
  "ExecStart=/usr/bin/node /opt/a3st/service/dist/index.js",
  "Restart=on-failure",
  "RestartSec=3",
  "KillSignal=SIGTERM",
  "TimeoutStopSec=30",
  "",
  "[Install]",
  "WantedBy=multi-user.target",
  "",
  ].join("\n");
}

function bundleReadme(bundleVersion) {
  return [
    `# Arma3 Server Tools ${bundleVersion} - Linux 便携包`,
    "",
    "内置 Node Service + Web 控制台，解压即可在 VPS / 小主机上开服，浏览器远程操作。",
    "",
    "## 环境要求",
    "",
    "- x64 Linux（Ubuntu 22.04+ / Debian 12+ 等），Node.js >= 20",
    "- `tar`（解压 SteamCMD 用）、`ss`（UDP 端口检测，iproute2）",
    "- 服务器目录与 Workshop 路径建议使用英文/ASCII",
    "",
    "## 快速开始",
    "",
    "```bash",
    "tar -xzf Arma3ServerTools-linux-*.tar.gz",
    "cd Arma3ServerTools-linux-*",
    "cp a3st.env.example a3st.env",
    "vi a3st.env            # 至少填写 API_TOKEN；需要远程直连时改 HOST=0.0.0.0",
    "bash start.sh",
    "```",
    "",
    "浏览器打开 `http://<服务器IP>:19580/`，用 `API_TOKEN` 登录（Authorization: Bearer 或 ?token=）。",
    "`GET /api/v1/health` 可确认版本、平台与鉴权状态。",
    "",
    "## systemd 托管（推荐）",
    "",
    "```bash",
    "sudo useradd --system --home /opt/a3st --shell /usr/sbin/nologin a3st",
    "sudo mkdir -p /opt/a3st /var/lib/a3st",
    "sudo cp -r . /opt/a3st/",
    "sudo cp /opt/a3st/a3st.service /etc/systemd/system/a3st.service",
    "sudo systemctl daemon-reload",
    "sudo systemctl enable --now a3st",
    "sudo journalctl -u a3st -f",
    "```",
    "",
    "单元模板假设安装到 `/opt/a3st`、数据目录 `/var/lib/a3st`；如路径不同请同步修改",
    "`a3st.service` 的 `WorkingDirectory`/`Environment`/`ExecStart`，并确保 `a3st.env` 可被服务用户读取。",
    "",
    "## 升级",
    "",
    "1. `sudo systemctl stop a3st`",
    "2. 备份 `data/`（或 `/var/lib/a3st`）",
    "3. 用新包的 `service/`、`web/` 覆盖旧目录，保留 `a3st.env` 与数据目录",
    "4. `sudo systemctl start a3st`",
    "",
    "## 公网部署",
    "",
    "不要直接暴露 19580：推荐 Caddy/Nginx 终止 TLS 反代到 `127.0.0.1:19580`，",
    "SSE（SteamCMD 进度）需关闭缓冲。详见仓库 `docs/linux-server.md`。",
    "",
    "## 已知限制",
    "",
    "- 监控扩展 `DestinyServerMonitoring` 为 Windows .NET 4.8 DLL，Linux 上不可用；",
    "  需在模组配置中禁用监控（或自行编译原生 .so）。",
    "- BattlEye RCon 与 Windows 行为一致，请实测防火墙与 UDP 端口。",
    "",
  ].join("\n");
}
