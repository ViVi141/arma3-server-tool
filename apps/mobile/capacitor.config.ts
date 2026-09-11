import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vivi141.a3st",
  appName: "A3ST",
  webDir: "www",
  server: {
    // Capacitor WebView 使用 https 本地 origin；访问局域网 http:// Service 需 cleartext。
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
