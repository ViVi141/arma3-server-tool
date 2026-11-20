import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { configuredPathKey } from "../util/path-identity.js";

export interface LockScope {
  instances?: string[];
  paths?: Array<{ path: string; mode: "read" | "write" }>;
}
interface Claims { instances: string[]; paths: Array<{ path: string; mode: "read" | "write" }> }
interface Owner { active: boolean }
interface Held { owner: Owner; claims: Claims }
export class MaintenanceLockError extends Error {
  readonly code = "MAINTENANCE_LOCKED";
  readonly statusCode = 409;
  constructor() { super("目标实例或物理目录正在维护/执行操作，请等待完成后重试"); }
}

/** 新下载目录尚不存在时解析最近现存父路径；读取失败不能退化为词法路径放行。 */
export function physicalLockPath(value: string): string {
  if (!path.isAbsolute(value)) throw new Error("维护锁要求绝对路径");
  let ancestor = path.resolve(value);
  for (;;) {
    try {
      fs.lstatSync(ancestor);
      return configuredPathKey(path.join(fs.realpathSync(ancestor), path.relative(ancestor, value)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // 悬空链接不能当成尚未创建的目录，否则会漏掉真实写入目标。
      try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error("维护目标包含悬空链接"); }
      catch (checkError) { if ((checkError as NodeJS.ErrnoException).code !== "ENOENT") throw checkError; }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}
function overlaps(a: string, b: string): boolean {
  const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  };
  return inside(a, b) || inside(b, a);
}

/** Service 内全局原子租约。所有范围一次获取，冲突即拒绝，不进行部分获取或死锁等待。 */
export class MaintenanceLocks {
  private readonly context = new AsyncLocalStorage<Owner>();
  private readonly held = new Set<Held>();
  private claims(scope: LockScope): Claims {
    return { instances: [...new Set(scope.instances ?? [])], paths: (scope.paths ?? []).map((item) => ({ ...item, path: physicalLockPath(item.path) })) };
  }
  private check(claims: Claims, owner?: Owner): void {
    for (const entry of this.held) {
      if (owner?.active && entry.owner === owner) continue;
      if (entry.claims.instances.some((uuid) => claims.instances.includes(uuid)) || entry.claims.paths.some((a) => claims.paths.some((b) => (a.mode === "write" || b.mode === "write") && overlaps(a.path, b.path)))) throw new MaintenanceLockError();
    }
  }
  assertAvailable(scope: LockScope): void { this.check(this.claims(scope), this.context.getStore()); }
  assertNoForeignWrites(): void {
    const owner = this.context.getStore();
    if ([...this.held].some((entry) => entry.owner !== owner && entry.claims.paths.some((item) => item.mode === "write"))) throw new MaintenanceLockError();
  }
  acquire(scope: LockScope): { run: <T>(fn: () => T) => T; release: () => void } {
    const inherited = this.context.getStore();
    const owner = inherited?.active ? inherited : { active: true };
    const claims = this.claims(scope); this.check(claims, owner);
    const entry = { owner, claims }; this.held.add(entry);
    let released = false;
    return {
      run: <T>(fn: () => T): T => {
        if (released) throw new Error("维护租约已释放");
        return this.context.run(owner, fn);
      },
      release: () => {
        if (released) return;
        released = true; this.held.delete(entry);
        if (![...this.held].some((other) => other.owner === owner)) owner.active = false;
      },
    };
  }
  async run<T>(scope: LockScope, fn: () => Promise<T>): Promise<T> {
    const lease = this.acquire(scope);
    try { return await lease.run(fn); } finally { lease.release(); }
  }
}

// 与进程/HC 管理器一致：同一 Service 进程的所有入口共享，调用方不能从请求体指定 owner。
export const maintenanceLocks = new MaintenanceLocks();
