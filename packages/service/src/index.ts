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
// A3ST_KEEP_SERVERS_ON_STOP=1：收到信号时保留游戏服务器进程（下次启动按 PID+身份收养），
// 便于 systemd 重启 Service 而不打断正在运行的服务器；默认仍全部停止。
function keepGameServersOnStop(): boolean {
  const flag = (process.env.A3ST_KEEP_SERVERS_ON_STOP ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

async function shutdown(signal: string): Promise<void> {
  service.log.info(`Shutting down (${signal})...`);
  service.steamCmd.requestAbort();
  if (keepGameServersOnStop()) {
    service.log.info(
      "A3ST_KEEP_SERVERS_ON_STOP enabled: game servers keep running and will be re-adopted on next start."
    );
  } else {
    service.processManager.killAll();
  }
  await service.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
