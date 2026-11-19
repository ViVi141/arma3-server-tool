import { describe, it, expect, afterEach } from "vitest";
import { isAllowedCorsOrigin, isAllowedRequestOrigin } from "./origin.js";

const originalAllowedOrigins = process.env.A3ST_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.A3ST_ALLOWED_ORIGINS;
  } else {
    process.env.A3ST_ALLOWED_ORIGINS = originalAllowedOrigins;
  }
});

describe("isAllowedCorsOrigin", () => {
  it("allows non-browser and file:// callers", () => {
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
    expect(isAllowedCorsOrigin("null")).toBe(true);
  });

  it("allows loopback and Capacitor origins", () => {
    expect(isAllowedCorsOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedCorsOrigin("http://127.0.0.1:19580")).toBe(true);
    expect(isAllowedCorsOrigin("https://[::1]:19580")).toBe(true);
    expect(isAllowedCorsOrigin("capacitor://localhost")).toBe(true);
  });

  it("rejects arbitrary websites and malformed origins", () => {
    expect(isAllowedCorsOrigin("https://evil.example")).toBe(false);
    expect(isAllowedCorsOrigin("http://192.168.1.5:19580")).toBe(false);
    expect(isAllowedCorsOrigin("not a url")).toBe(false);
  });

  it("honors A3ST_ALLOWED_ORIGINS entries", () => {
    process.env.A3ST_ALLOWED_ORIGINS = "https://panel.example, http://10.0.0.5:8080";
    expect(isAllowedCorsOrigin("https://panel.example")).toBe(true);
    expect(isAllowedCorsOrigin("http://10.0.0.5:8080")).toBe(true);
    expect(isAllowedCorsOrigin("https://other.example")).toBe(false);
  });
});

describe("isAllowedRequestOrigin", () => {
  it("allows missing origin and whitelisted origins", () => {
    expect(isAllowedRequestOrigin(undefined, "127.0.0.1:19580")).toBe(true);
    expect(isAllowedRequestOrigin("null", "127.0.0.1:19580")).toBe(true);
    expect(isAllowedRequestOrigin("http://localhost:5173", "127.0.0.1:19580")).toBe(true);
  });

  it("allows same-origin LAN requests", () => {
    // 浏览器直接打开 http://192.168.1.5:19580 时 Origin 与 Host 一致，必须放行。
    expect(isAllowedRequestOrigin("http://192.168.1.5:19580", "192.168.1.5:19580")).toBe(true);
  });

  it("rejects cross-origin requests", () => {
    expect(isAllowedRequestOrigin("https://evil.example", "127.0.0.1:19580")).toBe(false);
    expect(isAllowedRequestOrigin("http://192.168.1.5:19580", "127.0.0.1:19580")).toBe(false);
    expect(isAllowedRequestOrigin("http://192.168.1.5:19580", undefined)).toBe(false);
  });
});
