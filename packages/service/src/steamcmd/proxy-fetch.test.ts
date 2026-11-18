import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const { mockUndiciFetch, constructedAgents } = vi.hoisted(() => ({
  mockUndiciFetch: vi.fn(),
  constructedAgents: [] as Array<{ url: string; close: ReturnType<typeof vi.fn> }>,
}));

vi.mock("undici", () => ({
  ProxyAgent: class MockProxyAgent {
    url: string;
    close = vi.fn(async () => {});
    constructor(url: string) {
      this.url = url;
      constructedAgents.push(this);
    }
  },
  fetch: mockUndiciFetch,
}));

import { closeProxyAgents, describeNetworkError, proxyFetch } from "./proxy-fetch.js";

describe("describeNetworkError", () => {
  it("joins Error.cause and code", () => {
    const cause = new Error("getaddrinfo ENOTFOUND steamcdn-a.akamaihd.net");
    (cause as Error & { code?: string }).code = "ENOTFOUND";
    const err = new Error("fetch failed");
    (err as Error & { cause?: Error }).cause = cause;
    expect(describeNetworkError(err)).toContain("fetch failed");
    expect(describeNetworkError(err)).toContain("ENOTFOUND");
    expect(describeNetworkError(err)).toContain("steamcdn-a.akamaihd.net");
  });
});

describe("PERF-5 ProxyAgent cache and reuse", () => {
  const prevHttps = process.env.HTTPS_PROXY;
  const prevHttp = process.env.HTTP_PROXY;
  const prevLowerHttps = process.env.https_proxy;
  const prevLowerHttp = process.env.http_proxy;

  beforeEach(async () => {
    constructedAgents.length = 0;
    mockUndiciFetch.mockReset();
    mockUndiciFetch.mockResolvedValue({ ok: true, status: 200 });
    await closeProxyAgents();
  });

  afterEach(async () => {
    await closeProxyAgents();
    if (prevHttps === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = prevHttps;
    if (prevHttp === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = prevHttp;
    if (prevLowerHttps === undefined) delete process.env.https_proxy;
    else process.env.https_proxy = prevLowerHttps;
    if (prevLowerHttp === undefined) delete process.env.http_proxy;
    else process.env.http_proxy = prevLowerHttp;
  });

  it("reuses one ProxyAgent per proxyUrl and reconstructs when URL changes", async () => {
    delete process.env.https_proxy;
    delete process.env.http_proxy;
    delete process.env.HTTP_PROXY;
    process.env.HTTPS_PROXY = "http://127.0.0.1:8888";

    await proxyFetch("https://a.test");
    await proxyFetch("https://b.test");
    expect(constructedAgents).toHaveLength(1);
    expect(constructedAgents[0].url).toBe("http://127.0.0.1:8888");
    expect(mockUndiciFetch.mock.calls[0][1].dispatcher).toBe(
      mockUndiciFetch.mock.calls[1][1].dispatcher
    );

    process.env.HTTPS_PROXY = "http://127.0.0.1:9999";
    await proxyFetch("https://c.test");
    expect(constructedAgents).toHaveLength(2);
    expect(constructedAgents[1].url).toBe("http://127.0.0.1:9999");

    await closeProxyAgents();
    expect(constructedAgents[0].close).toHaveBeenCalledTimes(1);
    expect(constructedAgents[1].close).toHaveBeenCalledTimes(1);
  });
});
