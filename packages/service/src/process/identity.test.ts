import { describe, it, expect } from "vitest";
import {
  commandLineContainsNameForTest,
  commandLineContainsPortForTest,
} from "./identity.js";

describe("process identity markers", () => {
  it("matches -name=uuid in command line", () => {
    const cmd = `C:\\arma3\\arma3server_x64.exe "-config=..." "-name=abc-uuid" -port=2302`;
    expect(commandLineContainsNameForTest(cmd, "abc-uuid")).toBe(true);
    expect(commandLineContainsNameForTest(cmd, "other-uuid")).toBe(false);
  });

  it("matches -port value", () => {
    const cmd = `arma3server_x64.exe -port=2402 "-name=x"`;
    expect(commandLineContainsPortForTest(cmd, 2402)).toBe(true);
    expect(commandLineContainsPortForTest(cmd, 2302)).toBe(false);
  });
});
