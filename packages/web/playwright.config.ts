import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    baseURL: "http://127.0.0.1:5174",
  },
  webServer: {
    command: "npx vite --port 5174 --host 127.0.0.1",
    url: "http://127.0.0.1:5174",
    cwd: webRoot,
    reuseExistingServer: process.env.A3ST_E2E_REUSE_VITE === "1",
    timeout: 120000,
  },
});
