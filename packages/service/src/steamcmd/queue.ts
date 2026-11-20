import { AsyncResource } from "node:async_hooks";

interface QueueEntry {
  controller: AbortController;
  run: () => Promise<void>;
  cancelWaiting: () => void;
}

const cancelled = () => new Error("SteamCMD 操作已取消");

/** FIFO 业务队列：取消运行项后仍等其退出，不能提前释放锁启动下一进程。 */
export class SteamCmdQueue {
  private waiting: QueueEntry[] = [];
  private active: QueueEntry | null = null;
  private closed = false;
  private idleWaiters: Array<() => void> = [];
  get isBusy(): boolean { return this.active !== null || this.waiting.length > 0; }
  get pendingCount(): number { return this.waiting.length; }

  enqueue<T>(fn: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(new Error("SteamCMD 队列已关闭"));
    if (signal?.aborted) return Promise.reject(cancelled());
    if (this.waiting.length >= 100) return Promise.reject(new Error("SteamCMD 等待队列已满，请稍后重试"));
    const runInContext = AsyncResource.bind(fn);
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const entry: QueueEntry = {
        controller,
        cancelWaiting: () => { cleanup(); reject(cancelled()); },
        run: async () => {
          try {
            if (controller.signal.aborted) throw cancelled();
            const result = await runInContext(controller.signal);
            if (controller.signal.aborted) throw cancelled();
            resolve(result);
          } catch (error) { reject(error); }
          finally { cleanup(); this.active = null; this.pump(); }
        },
      };
      const abort = () => {
        if (this.active === entry) controller.abort();
        else {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) { this.waiting.splice(index, 1); entry.cancelWaiting(); }
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.waiting.push(entry);
      this.pump();
    });
  }

  cancelAll(): void {
    for (const entry of this.waiting.splice(0)) entry.cancelWaiting();
    this.active?.controller.abort();
  }

  close(): Promise<void> {
    this.closed = true;
    this.cancelAll();
    if (!this.active) return Promise.resolve();
    return new Promise<void>((resolve) => { this.idleWaiters.push(resolve); });
  }

  private pump(): void {
    if (this.active) return;
    const entry = this.waiting.shift();
    if (!entry) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
      return;
    }
    this.active = entry;
    void entry.run();
  }
}
