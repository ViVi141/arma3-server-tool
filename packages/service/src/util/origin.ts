const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function extraAllowedOrigins(): string[] {
  return (process.env.A3ST_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

/**
 * CORS 白名单：浏览器页面是否允许读取本服务响应。
 * 允许：无 Origin（非浏览器客户端）、file:// 界面（Origin: null）、回环地址、
 * Capacitor WebView（capacitor://localhost），以及 A3ST_ALLOWED_ORIGINS 显式配置的来源。
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin || origin === "null") {
    return true;
  }
  if (extraAllowedOrigins().includes(origin)) {
    return true;
  }
  const url = parseOrigin(origin);
  if (!url) {
    return false;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase());
  }
  if (url.protocol === "capacitor:" && url.hostname.toLowerCase() === "localhost") {
    return true;
  }
  return false;
}

/**
 * 请求来源校验：阻止任意网页驱动本机 API（含无预检的简单请求）。
 * 同源放行——浏览器直接访问 LAN 地址时 Origin 与 Host 一致，例如
 * http://192.168.1.5:19580 打开的界面调用同一地址的接口。
 */
export function isAllowedRequestOrigin(
  origin: string | undefined,
  requestHost: string | undefined
): boolean {
  if (!origin || origin === "null") {
    return true;
  }
  if (isAllowedCorsOrigin(origin)) {
    return true;
  }
  const url = parseOrigin(origin);
  if (!url || !requestHost) {
    return false;
  }
  return url.host.toLowerCase() === requestHost.toLowerCase();
}
