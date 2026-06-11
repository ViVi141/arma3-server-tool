import { describe, it, expect } from "vitest";
import { Cron } from "croner";
import { Scheduler } from "./cron.js";

describe("Scheduler", () => {
  it("adds and runs a job", async () => {
    const s = new Scheduler();
    let ran = false;
    s.add({ name: "test", schedule: "* * * * * *", handler: () => { ran = true; } });
    await new Promise((r) => setTimeout(r, 1100));
    expect(ran).toBe(true);
    s.clear();
  });

  it("removes a job", async () => {
    const s = new Scheduler();
    let ran = false;
    s.add({ name: "test", schedule: "* * * * * *", handler: () => { ran = true; } });
    s.remove("test");
    await new Promise((r) => setTimeout(r, 1100));
    expect(ran).toBe(false);
  });

  it("clear stops all jobs", async () => {
    const s = new Scheduler();
    let count = 0;
    s.add({ name: "a", schedule: "* * * * * *", handler: () => { count++; } });
    s.add({ name: "b", schedule: "* * * * * *", handler: () => { count++; } });
    s.clear();
    await new Promise((r) => setTimeout(r, 1100));
    expect(count).toBe(0);
  });

  it("remove non-existent job does nothing", () => {
    const s = new Scheduler();
    expect(() => s.remove("nope")).not.toThrow();
  });
});
