import path from "node:path";
import { createService } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "19580", 10);
const HOST = process.env.HOST ?? "127.0.0.1";
const API_TOKEN = process.env.API_TOKEN ?? "";

function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return path.join(process.cwd(), ".a3st-dev-data");
}

const DATA_DIR = resolveDataDir();

const service = await createService({
  port: PORT,
  host: HOST,
  dataDir: DATA_DIR,
  apiToken: API_TOKEN,
});

// Graceful shutdown
process.on("SIGINT", async () => {
  service.log.info("Shutting down...");
  service.processManager.killAll();
  await service.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  service.log.info("Shutting down...");
  service.processManager.killAll();
  await service.close();
  process.exit(0);
});
