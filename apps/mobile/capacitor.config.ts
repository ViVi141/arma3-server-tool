import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vivi141.a3st",
  appName: "A3ST",
  webDir: "www",
  server: {
    // LAN 开服机常用 http://192.168.*；Android 9+ 默认禁明文，需配合 network_security_config。
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
