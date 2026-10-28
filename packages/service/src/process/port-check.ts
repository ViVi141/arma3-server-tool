import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { isWindows } from "../platform/index.js";

/**
 * Check whether a TCP port is currently in LISTEN state on this machine.
 * Used as a readiness probe: an arma3server process being alive does not
 * imply the game port is up (it may be stuck on an invisible error dialog).
 */
export function isPortListening(port: number): boolean {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return false;
  }
  if (isWindows()) {
    return isPortListeningWindows(port);
  }
  return isPortListeningLinux(port);
}

function isPortListeningWindows(port: number): boolean {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort)`,
      ],
      { encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }
    );
    return out.trim() === String(port);
  } catch {
    return false;
  }
}

function isPortListeningLinux(port: number): boolean {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      const local = fields[1] ?? "";
      const state = fields[3] ?? "";
      // state 0A = TCP_LISTEN
      if (state === "0A" && local.toUpperCase().endsWith(`:${hexPort}`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Poll until the port is listening or the process dies / timeout elapses.
 * `isAlive` lets callers abort early when the spawned process already exited.
 */
export async function waitForPortReady(
  port: number,
  timeoutMs: number,
  isAlive: () => boolean,
  intervalMs = 1000
): Promise<"ready" | "exited" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      return "exited";
    }
    if (isPortListening(port)) {
      return "ready";
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return isPortListening(port) ? "ready" : "timeout";
}
