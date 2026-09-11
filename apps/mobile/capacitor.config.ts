import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vivi141.a3st",
  appName: "A3ST",
  webDir: "www",
  server: {
    // 与局域网 http:// Service 同协议，避免混合内容。
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // 用原生 HTTP 打补丁 window.fetch，绕过 WebView CORS / 部分 cleartext 限制。
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
