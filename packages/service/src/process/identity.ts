import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type ProcessIdentityStatus = "match" | "mismatch" | "unknown";

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

export function verifyProcessIdentity(
  pid: number,
  expectedExecutable: string
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

  if (actualFullPath.toLowerCase() === expectedFullPath.toLowerCase()) {
    return "match";
  }
  return "mismatch";
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
