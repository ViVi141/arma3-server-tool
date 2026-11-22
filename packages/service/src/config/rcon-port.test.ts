import { describe, it, expect } from "vitest";
import {
  pickAvailableRconPort,
  resolveArmaGamePort,
  resolveEffectiveRconPort,
} from "./rcon-port.js";
import type { ServerConfigPackage } from "../types/config.js";

describe("resolveEffectiveRconPort", () => {
  it("defaults to gamePort+3 so Steam/BE reserved ports stay free", () => {
    const config: ServerConfigPackage = { formatVersion: 2, startup: { port: 2302 } };
    expect(resolveEffectiveRconPort(config)).toBe(2305);
    expect(pickAvailableRconPort(2302)).toBe(2305);
  });

  it("offsets a legacy RCon port that equals the game port", () => {
    const config: ServerConfigPackage = {
      formatVersion: 2,
      startup: { port: 2402 },
      battleye: { rconPort: 2402, rconPassword: "secret" },
    };
    expect(resolveEffectiveRconPort(config)).toBe(2405);
  });

  it("remaps Steam and BattlEye reserved ports to a free slot", () => {
    expect(
      resolveEffectiveRconPort({
        formatVersion: 2,
        basic: { port: 2302 },
        battleye: { rconPort: 2303 },
      })
    ).toBe(2305);
    expect(
      resolveEffectiveRconPort({
        formatVersion: 2,
        basic: { port: 2302 },
        battleye: { rconPort: 2306 },
      })
    ).toBe(2305);
  });

  it("keeps an explicit port that already differs from reserved offsets", () => {
    const config: ServerConfigPackage = {
      formatVersion: 2,
      basic: { port: 2302 },
      battleye: { rconPort: 2310 },
    };
    expect(resolveEffectiveRconPort(config)).toBe(2310);
  });

  it("falls back to the default game port for invalid values", () => {
    expect(resolveArmaGamePort({ formatVersion: 2, startup: { port: Number.NaN } })).toBe(2302);
    expect(resolveArmaGamePort({ formatVersion: 2, startup: { port: 70000 } })).toBe(2302);
    expect(
      resolveEffectiveRconPort({ formatVersion: 2, battleye: { rconPort: 70000 } })
    ).toBe(2305);
  });

  it("still finds a free port when the game port is near the maximum", () => {
    const config: ServerConfigPackage = { formatVersion: 2, startup: { port: 65535 } };
    const port = resolveEffectiveRconPort(config);
    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
    expect(port).not.toBe(65535);
  });
});
