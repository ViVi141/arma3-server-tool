import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { resolve } from "path";

export default defineConfig(({ mode }) => ({
  // Electron file:// 与 Service 静态托管都需要相对资源路径；绝对 /assets 会白屏。
  base: "./",
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: mode === "development"
      ? {
          "/api": {
            target: "http://127.0.0.1:19580",
            changeOrigin: true,
          },
        }
      : undefined,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
