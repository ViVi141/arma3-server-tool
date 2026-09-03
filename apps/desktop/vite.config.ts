import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import { resolve } from "path";

export default defineConfig({
  appType: "custom",
  plugins: [
    electron([
      {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "main.js",
              },
            },
          },
        },
      },
      {
        entry: "src/preload/index.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            // Electron preload 必须是 CJS；ESM import 在打包后会静默失败，导致无 electronAPI。
            lib: {
              entry: "src/preload/index.ts",
              formats: ["cjs"],
              fileName: () => "preload.cjs",
            },
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  root: ".",
  build: {
    outDir: "dist-stub",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/build-stub.ts"),
      formats: ["es"],
      fileName: () => "stub.js",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
