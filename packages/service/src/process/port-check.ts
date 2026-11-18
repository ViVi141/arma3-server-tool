import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";
import { isWindows } from "../platform/index.js";

const execFileAsync = promisify(execFile);

const WINDOWS_UDP_PROBE_SCRIPT =
  "$p = 0; if ([uint16]::TryParse($env:A3ST_PROBE_PORT, [ref]$p) -and $p -gt 0) { (Get-NetUDPEndpoint -LocalPort ([int]$p) -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort) }";

export function isValidPort(port: unknown): port is number {
  return typeof port === "number" && Number.isSafeInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Parse `/proc/net/udp` or `/proc/net/udp6` content to determine whether `port`
 * is currently bound on this host.
 */
export function parseProcNetUdp(raw: string, port: number): boolean {
  if (!isValidPort(port)) {
    return false;
  }
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  const targetSuffix = `:${hexPort}`;
  for (const line of raw.split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4) {
      continue;
    }
    const local = fields[1] ?? "";
    const state = fields[3] ?? "";
    // UDP bound socket is 07 (TCP_CLOSE); connected UDP socket is 01 (TCP_ESTABLISHED)
    if ((state === "07" || state === "01") && local.toUpperCase().endsWith(targetSuffix)) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a UDP game port is currently bound on this machine.
 * Used as a readiness probe: an arma3server process being alive does not
 * imply the game port is up (it may be stuck on an invisible error dialog).
 */
export function isPortListening(port: number): boolean {
  if (!isValidPort(port)) {
    return false;
  }
  if (isWindows()) {
    return isUdpPortListeningWindows(port);
  }
  return isUdpPortListeningLinux(port);
}

export async function isPortListeningAsync(port: number): Promise<boolean> {
  if (!isValidPort(port)) {
    return false;
  }
  if (isWindows()) {
    return isUdpPortListeningWindowsAsync(port);
  }
  return isUdpPortListeningLinuxAsync(port);
}

function isUdpPortListeningWindows(port: number): boolean {
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_UDP_PROBE_SCRIPT],
      {
        encoding: "utf-8",
        timeout: 3000,
        env: { ...process.env, A3ST_PROBE_PORT: String(port) },
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }
    );
    return out.trim() === String(port);
  } catch {
    return false;
  }
}

async function isUdpPortListeningWindowsAsync(port: number): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_UDP_PROBE_SCRIPT],
      {
        encoding: "utf-8",
        timeout: 3000,
        env: { ...process.env, A3ST_PROBE_PORT: String(port) },
        windowsHide: true,
      }
    );
    return stdout.trim() === String(port);
  } catch {
    return false;
  }
}

function isUdpPortListeningLinux(port: number): boolean {
  for (const file of ["/proc/net/udp", "/proc/net/udp6"]) {
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (parseProcNetUdp(raw, port)) {
      return true;
    }
  }
  return false;
}

async function isUdpPortListeningLinuxAsync(port: number): Promise<boolean> {
  for (const file of ["/proc/net/udp", "/proc/net/udp6"]) {
    let raw = "";
    try {
      raw = await fs.promises.readFile(file, "utf-8");
    } catch {
      continue;
    }
    if (parseProcNetUdp(raw, port)) {
      return true;
    }
  }
  return false;
}

/**
 * Poll until the UDP port is bound or the process dies / timeout elapses.
 * `isAlive` lets callers abort early when the spawned process already exited.
 */
export async function waitForPortReady(
  port: number,
  timeoutMs: number,
  isAlive: () => boolean,
  intervalMs = 1000,
  probe: (port: number) => boolean | Promise<boolean> = isPortListeningAsync
): Promise<"ready" | "exited" | "timeout"> {
  if (!isAlive()) {
    return "exited";
  }
  if (!isValidPort(port)) {
    return "timeout";
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      return "exited";
    }
    if (await probe(port)) {
      return "ready";
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!isAlive()) {
    return "exited";
  }
  return (await probe(port)) ? "ready" : "timeout";
}
