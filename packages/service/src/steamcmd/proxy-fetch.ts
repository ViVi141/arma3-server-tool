import { ProxyAgent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";

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

export async function proxyFetch(url: string, init?: ProxyFetchInit): Promise<UndiciResponse> {
  const proxyUrl = resolveProxyUrl();
  let timeoutMs = 20000;
  if (init && init.timeoutMs !== undefined) {
    timeoutMs = init.timeoutMs;
  }
  const signal = AbortSignal.timeout(timeoutMs);

  const requestInit = {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal,
  };

  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    return undiciFetch(url, {
      ...requestInit,
      dispatcher,
    });
  }

  return undiciFetch(url, requestInit);
}

export function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts: string[] = [error.message];
  const withCause = error as Error & { cause?: unknown };
  if (withCause.cause instanceof Error) {
    parts.push(withCause.cause.message);
    const coded = withCause.cause as Error & { code?: string };
    if (coded.code) {
      parts.push(coded.code);
    }
  }
  return parts.join(" — ");
}
