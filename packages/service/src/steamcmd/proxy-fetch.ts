import { ProxyAgent, fetch as undiciFetch } from "undici";

function resolveProxyUrl(): string | undefined {
  const fromEnv =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;
  if (!fromEnv || !fromEnv.trim()) {
    return undefined;
  }
  return fromEnv.trim();
}

export interface ProxyFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function proxyFetch(url: string, init?: ProxyFetchInit): Promise<Response> {
  const proxyUrl = resolveProxyUrl();
  const timeoutMs = init?.timeoutMs ?? 20000;
  const signal = AbortSignal.timeout(timeoutMs);

  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    return undiciFetch(url, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
      signal,
      dispatcher,
    }) as Promise<Response>;
  }

  return fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal,
  });
}
