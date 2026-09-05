import { describe, it, expect } from "vitest";
import { AsyncTaskManager } from "./manager.js";

describe("AsyncTaskManager", () => {
  it("creates a task with Pending status", () => {
    const mgr = new AsyncTaskManager();
    const id = mgr.create("uuid-1", [{ action: "status" }]);
    const task = mgr.get(id);
    expect(task).toBeDefined();
    expect(task!.status).toBe("Pending");
    expect(task!.serverUuid).toBe("uuid-1");
    expect(task!.commands).toHaveLength(1);
  });

  it("starts a task", () => {
    const mgr = new AsyncTaskManager();
    const id = mgr.create("uuid-1", [{ action: "start" }]);
    mgr.start(id);
    expect(mgr.get(id)!.status).toBe("Running");
  });

  it("appends steps", () => {
    const mgr = new AsyncTaskManager();
    const id = mgr.create("uuid-1", [{ action: "start" }]);
    mgr.appendStep(id, "start", true, "OK");
    const task = mgr.get(id)!;
    expect(task.results).toHaveLength(1);
    expect(task.results[0].action).toBe("start");
    expect(task.log).toHaveLength(1);
  });

  it("completes a task as Succeeded", () => {
    const mgr = new AsyncTaskManager();
    const id = mgr.create("uuid-1", [{ action: "start" }]);
    mgr.complete(id);
    expect(mgr.get(id)!.status).toBe("Succeeded");
    expect(mgr.get(id)!.completedAt).toBeDefined();
  });

  it("completes a task as Failed with error", () => {
    const mgr = new AsyncTaskManager();
    const id = mgr.create("uuid-1", [{ action: "start" }]);
    mgr.complete(id, "something broke");
    expect(mgr.get(id)!.status).toBe("Failed");
    expect(mgr.get(id)!.error).toBe("something broke");
  });

  it("returns undefined for non-existent task", () => {
    const mgr = new AsyncTaskManager();
    expect(mgr.get("nonexistent")).toBeUndefined();
  });

  it("runSync executes all commands", async () => {
    const mgr = new AsyncTaskManager();
    const result = await mgr.runSync(
      "uuid-1",
      [{ action: "a" }, { action: "b" }],
      async (cmd) => ({ success: true, message: `${cmd.action} done` })
    );
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.message).toBe("任务完成");
  });

  it("runSync stops on failure", async () => {
    const mgr = new AsyncTaskManager();
    const result = await mgr.runSync(
      "uuid-1",
      [{ action: "ok" }, { action: "fail" }, { action: "never" }],
      async (cmd) => cmd.action === "fail"
        ? { success: false, message: "failed" }
        : { success: true, message: "ok" }
    );
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2);
  });

  it("runSync handles exceptions", async () => {
    const mgr = new AsyncTaskManager();
    const result = await mgr.runSync(
      "uuid-1",
      [{ action: "boom" }],
      async () => { throw new Error("kaboom"); }
    );
    expect(result.success).toBe(false);
    expect(result.results[0].message).toContain("kaboom");
  });

  it("runAsync returns a taskId and executes in background", async () => {
    const mgr = new AsyncTaskManager();
    const taskId = await mgr.runAsync(
      "uuid-1",
      [{ action: "test" }],
      async () => ({ success: true, message: "done" })
    );
    expect(taskId).toBeTypeOf("string");

    // Wait briefly for background execution
    await new Promise((r) => setTimeout(r, 100));

    const task = mgr.get(taskId);
    expect(task).toBeDefined();
    expect(task!.status).toBe("Succeeded");
  });

  it("runAsync handles background failure", async () => {
    const mgr = new AsyncTaskManager();
    const taskId = await mgr.runAsync(
      "uuid-1",
      [{ action: "fail" }],
      async () => { throw new Error("bg error"); }
    );

    await new Promise((r) => setTimeout(r, 100));

    const task = mgr.get(taskId);
    expect(task!.status).toBe("Failed");
    expect(task!.error).toContain("bg error");
  });

  it("cancel marks a running task as Cancelled", async () => {
    const mgr = new AsyncTaskManager();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const taskId = await mgr.runAsync(
      "uuid-1",
      [{ action: "download_mods" }],
      async () => {
        await gate;
        return { success: true, message: "done" };
      }
    );

    expect(mgr.get(taskId)!.status).toBe("Running");
    const cancelled = mgr.cancel(taskId);
    expect(cancelled).toBe(true);
    expect(mgr.get(taskId)!.status).toBe("Cancelled");
    release();

    await new Promise((r) => setTimeout(r, 50));
    expect(mgr.get(taskId)!.status).toBe("Cancelled");
  });

  it("cancelSteamCmdRelatedRunning only cancels SteamCMD tasks", async () => {
    const mgr = new AsyncTaskManager();
    let releaseDl!: () => void;
    let releaseStatus!: () => void;
    const gateDl = new Promise<void>((resolve) => {
      releaseDl = resolve;
    });
    const gateStatus = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });

    const downloadId = await mgr.runAsync(
      "uuid-1",
      [{ action: "download_mods" }],
      async () => {
        await gateDl;
        return { success: true, message: "dl" };
      }
    );
    const statusId = await mgr.runAsync(
      "uuid-1",
      [{ action: "status" }],
      async () => {
        await gateStatus;
        return { success: true, message: "ok" };
      }
    );

    const cancelled = mgr.cancelSteamCmdRelatedRunning();
    expect(cancelled).toEqual([downloadId]);
    expect(mgr.get(downloadId)!.status).toBe("Cancelled");
    expect(mgr.get(statusId)!.status).toBe("Running");

    releaseDl();
    releaseStatus();
    await new Promise((r) => setTimeout(r, 50));
  });
});
