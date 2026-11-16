import { describe, it, expect } from "vitest";
import {
  authStateLabel,
  detectAuthStateFromOutput,
  normalizeLoginMode,
} from "./login-mode.js";
import { buildLoginClause, buildWorkshopDownloadArguments } from "./arguments.js";

describe("normalizeLoginMode", () => {
  it("accepts cached and defaults to password", () => {
    expect(normalizeLoginMode("cached")).toBe("cached");
    expect(normalizeLoginMode("password")).toBe("password");
    expect(normalizeLoginMode(undefined)).toBe("password");
    expect(normalizeLoginMode("other")).toBe("password");
  });
});

describe("buildLoginClause", () => {
  it("omits password entirely in cached mode", () => {
    expect(buildLoginClause("user", "secret", "cached")).toBe('+login "user"');
    expect(buildLoginClause("user", "secret", "cached")).not.toContain("secret");
  });

  it("includes password in password mode", () => {
    expect(buildLoginClause("user", "secret", "password")).toBe('+login "user" "secret"');
  });
});

describe("buildWorkshopDownloadArguments cached mode", () => {
  it("does not carry password parameter", () => {
    const args = buildWorkshopDownloadArguments(
      "user",
      "should-not-appear",
      "C:\\workshop",
      [111],
      { loginMode: "cached" },
    );
    expect(args).toContain('+login "user"');
    expect(args).not.toContain("should-not-appear");
    expect(args).toContain("workshop_download_item 107410 111");
  });

  it("keeps password mode compatible with prior behavior", () => {
    const args = buildWorkshopDownloadArguments("user", "pass", "C:\\workshop", [111]);
    expect(args).toContain('+login "user" "pass"');
  });
});

describe("detectAuthStateFromOutput", () => {
  it("detects waiting_guard and does not leak credentials", () => {
    expect(detectAuthStateFromOutput("Waiting for confirmation")).toBe("waiting_guard");
    expect(detectAuthStateFromOutput("Steam Guard code required")).toBe("waiting_guard");
    expect(detectAuthStateFromOutput("Logging in using username/password")).toBe("password_login");
    expect(detectAuthStateFromOutput("Logging in using cached credentials")).toBe("authenticated");
    expect(detectAuthStateFromOutput("Invalid Password")).toBe("auth_failed");
  });
});

describe("authStateLabel", () => {
  it("returns Chinese labels", () => {
    expect(authStateLabel("waiting_guard")).toBe("等待手机确认");
    expect(authStateLabel("cached_login")).toBe("缓存登录");
  });
});
