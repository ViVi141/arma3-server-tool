#!/usr/bin/env node
// Cross-platform cleanup for build outputs (works in Windows cmd / PowerShell).
// Usage:
//   node scripts/clean.mjs              # repository defaults
//   node scripts/clean.mjs dist         # paths relative to the current directory
//   node scripts/clean.mjs --dry-run    # print targets only

import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

const targets = args.length
  ? args.map((arg) => resolve(process.cwd(), arg))
  : [
      resolve(repoRoot, "packages/service/dist"),
      resolve(repoRoot, "packages/web/dist"),
      resolve(repoRoot, "apps/desktop/dist-electron"),
      resolve(repoRoot, "apps/desktop/dist-stub"),
      resolve(repoRoot, "apps/desktop/electron-resources"),
    ];

for (const target of targets) {
  if (dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  console.log(`removed ${target}`);
}
