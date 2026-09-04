import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type ProcessIdentityStatus = "match" | "mismatch" | "unknown";

export interface ProcessIdentityMarkers {
  /** Arma `-name=<uuid>` profile name */
  profileName?: string;
  /** Expected `-port=` value */
  port?: number;
}

export function isProcessRunning(pid: number): boolean {
  if (!pid || pid <= 0) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getProcessExecutablePath(pid: number): string | null {
  if (!pid || pid <= 0) {
    return null;
  }
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction Stop).Path"`,
        { encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }
      );
      const trimmed = out.trim();
      if (trimmed) {
        return trimmed;
      }
      return null;
    }
    const exeLink = `/proc/${pid}/exe`;
    if (fs.existsSync(exeLink)) {
      return fs.realpathSync(exeLink);
    }
    return null;
  } catch {
    return null;
  }
}

export function getProcessCommandLine(pid: number): string | null {
  if (!pid || pid <= 0) {
    return null;
  }
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
        { encoding: "utf-8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }
      );
      const trimmed = out.trim();
      if (trimmed) {
        return trimmed;
      }
      return null;
    }
    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (!fs.existsSync(cmdlinePath)) {
      return null;
    }
    const raw = fs.readFileSync(cmdlinePath);
    return raw.toString("utf-8").replace(/\0/g, " ").trim();
  } catch {
    return null;
  }
}

function commandLineContainsName(commandLine: string, profileName: string): boolean {
  const needle = profileName.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const lower = commandLine.toLowerCase();
  if (lower.includes(`-name=${needle}`)) {
    return true;
  }
  if (lower.includes(`-name ${needle}`)) {
    return true;
  }
  return false;
}

function commandLineContainsPort(commandLine: string, port: number): boolean {
  if (!port || port <= 0) {
    return true;
  }
  const lower = commandLine.toLowerCase();
  const portText = String(port);
  if (lower.includes(`-port=${portText}`)) {
    return true;
  }
  if (lower.includes(`-port ${portText}`)) {
    return true;
  }
  return false;
}

/** Exported for unit tests */
export function commandLineContainsNameForTest(
  commandLine: string,
  profileName: string
): boolean {
  return commandLineContainsName(commandLine, profileName);
}

/** Exported for unit tests */
export function commandLineContainsPortForTest(
  commandLine: string,
  port: number
): boolean {
  return commandLineContainsPort(commandLine, port);
}

export function verifyProcessIdentity(
  pid: number,
  expectedExecutable: string,
  markers?: ProcessIdentityMarkers
): ProcessIdentityStatus {
  if (!expectedExecutable.trim()) {
    return "unknown";
  }

  let expectedFullPath: string;
  try {
    expectedFullPath = fs.realpathSync(expectedExecutable);
  } catch {
    try {
      expectedFullPath = path.resolve(expectedExecutable);
    } catch {
      return "unknown";
    }
  }

  const actualPath = getProcessExecutablePath(pid);
  if (!actualPath) {
    return "unknown";
  }

  let actualFullPath: string;
  try {
    actualFullPath = fs.realpathSync(actualPath);
  } catch {
    actualFullPath = path.resolve(actualPath);
  }

  if (actualFullPath.toLowerCase() !== expectedFullPath.toLowerCase()) {
    return "mismatch";
  }

  if (!markers) {
    return "match";
  }

  const hasName = Boolean(markers.profileName && markers.profileName.trim());
  const hasPort = Boolean(markers.port && markers.port > 0);
  if (!hasName && !hasPort) {
    return "match";
  }

  const commandLine = getProcessCommandLine(pid);
  if (!commandLine) {
    return "unknown";
  }

  if (hasName && markers.profileName) {
    if (!commandLineContainsName(commandLine, markers.profileName)) {
      return "mismatch";
    }
  }
  if (hasPort && markers.port) {
    if (!commandLineContainsPort(commandLine, markers.port)) {
      return "mismatch";
    }
  }

  return "match";
}

export function killProcessTree(pid: number): boolean {
  if (!pid || pid <= 0) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore", timeout: 5000 });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}
