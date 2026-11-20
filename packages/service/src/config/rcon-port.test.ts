import { describe, it, expect } from "vitest";
import { resolveArmaGamePort, resolveEffectiveRconPort } from "./rcon-port.js";
import type { ServerConfigPackage } from "../types/config.js";

describe("resolveEffectiveRconPort", () => {
  it("defaults to gamePort+1 when no RCon port is configured", () => {
    const config: ServerConfigPackage = { formatVersion: 2, startup: { port: 2302 } };
    expect(resolveEffectiveRconPort(config)).toBe(2303);
  });

  it("offsets a legacy RCon port that equals the game port", () => {
    const config: ServerConfigPackage = {
      formatVersion: 2,
      startup: { port: 2402 },
      battleye: { rconPort: 2402, rconPassword: "secret" },
    };
    // BattlEye requires RConPort to differ from the game port.
    expect(resolveEffectiveRconPort(config)).toBe(2403);
  });

  it("keeps an explicit port that already differs from the game port", () => {
    const config: ServerConfigPackage = {
      formatVersion: 2,
      basic: { port: 2302 },
      battleye: { rconPort: 2306 },
    };
    expect(resolveEffectiveRconPort(config)).toBe(2306);
  });

  it("falls back to the default game port for invalid values", () => {
    expect(resolveArmaGamePort({ formatVersion: 2, startup: { port: Number.NaN } })).toBe(2302);
    expect(resolveArmaGamePort({ formatVersion: 2, startup: { port: 70000 } })).toBe(2302);
    expect(
      resolveEffectiveRconPort({ formatVersion: 2, battleye: { rconPort: 70000 } })
    ).toBe(2303);
  });

  it("offsets downward when the game port is already the maximum", () => {
    const config: ServerConfigPackage = { formatVersion: 2, startup: { port: 65535 } };
    expect(resolveEffectiveRconPort(config)).toBe(65534);
  });
});
