import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 版本号单一来源：
 * 1. 桌面端 spawn 时通过 A3ST_VERSION 注入 app.getVersion()（与安装包版本一致）；
 * 2. 独立运行（npm start / Linux 部署）时回退到最近的 package.json；
 * 3. 都拿不到时返回 "0.0.0"，避免把版本号硬编码在源码里。
 */
function resolveServiceVersion(): string {
  const fromEnv = process.env.A3ST_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // dist/version.js -> ../package.json；src/version.ts 由 vitest 直接加载时同理指向 dist 目录，
    // 因此再向上找一层兜底。
    const candidates = [
      path.resolve(here, "..", "package.json"),
      path.resolve(here, "..", "..", "package.json"),
    ];
    for (const candidate of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as { version?: string };
        if (pkg.version) {
          return pkg.version;
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // ignore and fall through
  }
  return "0.0.0";
}

export const SERVICE_VERSION = resolveServiceVersion();
