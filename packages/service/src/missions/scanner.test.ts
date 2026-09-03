import { describe, it, expect } from "vitest";
import { normalizeMissionTemplate, promoteMissionToFront } from "./scanner.js";

describe("promoteMissionToFront", () => {
  it("moves an existing template to index 0", () => {
    const result = promoteMissionToFront(
      [
        { template: "75TH_xxx", difficulty: 1 },
        { template: "TASKCLUB2", difficulty: 3 },
        { template: "other", difficulty: 2 },
      ],
      "TASKCLUB2"
    );
    expect(result.map((m) => m.template)).toEqual(["TASKCLUB2", "75TH_xxx", "other"]);
    expect(result[0].difficulty).toBe(3);
  });

  it("inserts a missing template at index 0", () => {
    const result = promoteMissionToFront(
      [{ template: "75TH_xxx", difficulty: 1 }],
      "TASKCLUB2",
      2
    );
    expect(result).toEqual([
      { template: "TASKCLUB2", difficulty: 2 },
      { template: "75TH_xxx", difficulty: 1 },
    ]);
  });

  it("matches .pbo suffix and updates difficulty", () => {
    const result = promoteMissionToFront(
      [
        { template: "TASKCLUB2.pbo", difficulty: 3 },
        { template: "75TH_xxx", difficulty: 1 },
      ],
      "TASKCLUB2",
      0
    );
    expect(result[0].template).toBe("TASKCLUB2.pbo");
    expect(result[0].difficulty).toBe(0);
    expect(result).toHaveLength(2);
  });

  it("dedupes duplicate templates while promoting", () => {
    const result = promoteMissionToFront(
      [
        { template: "A", difficulty: 1 },
        { template: "B", difficulty: 2 },
        { template: "B.pbo", difficulty: 3 },
      ],
      "B"
    );
    expect(result.map((m) => m.template)).toEqual(["B", "A"]);
  });
});

describe("normalizeMissionTemplate", () => {
  it("strips .pbo case-insensitively", () => {
    expect(normalizeMissionTemplate(" foo.PBO ")).toBe("foo");
  });
});
