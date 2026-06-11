import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npx vite --port 5174 --host",
    url: "http://localhost:5174",
    cwd: "C:\\Users\\74738\\Desktop\\arma3-server-tool\\packages\\web",
    reuseExistingServer: true,
    timeout: 10000,
  },
});
