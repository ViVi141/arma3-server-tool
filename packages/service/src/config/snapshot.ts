import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface ConfigSnapshot {
  id: string;
  label: string;
  timestamp: string;
  files: string[]; // relative paths in the snapshot
}

export class ConfigSnapshotStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.join(baseDir, "snapshots");
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /** Create a snapshot of a server's config package */
  create(uuid: string, label: string): string {
    const pkgDir = path.join(this.baseDir, "..", "config", uuid);
    if (!fs.existsSync(pkgDir)) throw new Error("配置不存在");

    const id = crypto.randomUUID().slice(0, 12);
    const snapDir = path.join(this.baseDir, uuid);
    fs.mkdirSync(snapDir, { recursive: true });

    // Copy all JSON files
    const manifest: ConfigSnapshot = {
      id,
      label,
      timestamp: new Date().toISOString(),
      files: [],
    };

    for (const file of fs.readdirSync(pkgDir)) {
      if (!file.endsWith(".json")) continue;
      const src = path.join(pkgDir, file);
      const dst = path.join(snapDir, `${id}_${file}`);
      fs.copyFileSync(src, dst);
      manifest.files.push(file);
    }

    // Write snapshot manifest
    fs.writeFileSync(
      path.join(snapDir, `${id}_snapshot.json`),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    return id;
  }

  /** List snapshots for a server */
  list(uuid: string): ConfigSnapshot[] {
    const snapDir = path.join(this.baseDir, uuid);
    if (!fs.existsSync(snapDir)) return [];

    const snaps: ConfigSnapshot[] = [];
    for (const file of fs.readdirSync(snapDir)) {
      if (!file.endsWith("_snapshot.json")) continue;
      try {
        const snap = JSON.parse(fs.readFileSync(path.join(snapDir, file), "utf-8")) as ConfigSnapshot;
        snaps.push(snap);
      } catch { /* skip */ }
    }

    return snaps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /** Restore a snapshot */
  restore(uuid: string, snapshotId: string): boolean {
    const snapDir = path.join(this.baseDir, uuid);
    const pkgDir = path.join(this.baseDir, "..", "config", uuid);
    if (!fs.existsSync(snapDir)) return false;

    // Find the snapshot files
    const prefix = `${snapshotId}_`;
    let found = false;
    for (const file of fs.readdirSync(snapDir)) {
      if (!file.startsWith(prefix) || file === `${snapshotId}_snapshot.json`) continue;
      const src = path.join(snapDir, file);
      const baseName = file.slice(prefix.length);
      const dst = path.join(pkgDir, baseName);
      fs.copyFileSync(src, dst);
      found = true;
    }

    return found;
  }

  /** Delete old snapshots, keep the N most recent */
  prune(uuid: string, keep = 10): void {
    const snaps = this.list(uuid);
    if (snaps.length <= keep) return;

    const toDelete = snaps.slice(keep);
    const snapDir = path.join(this.baseDir, uuid);
    for (const snap of toDelete) {
      const prefix = `${snap.id}_`;
      for (const file of fs.readdirSync(snapDir)) {
        if (file.startsWith(prefix)) {
          fs.unlinkSync(path.join(snapDir, file));
        }
      }
    }
  }
}
