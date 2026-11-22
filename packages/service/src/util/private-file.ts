import * as fs from "node:fs";
import { replaceFile } from "./replace-file.js";

/** Owner-only read/write (best-effort on Windows ACLs). */
export const PRIVATE_FILE_MODE = 0o600;

/** Tighten permissions after rename; ignore platforms that cannot chmod. */
export function chmodPrivate(filePath: string): void {
  try {
    fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  } catch {
    // Windows may ignore POSIX modes.
  }
}

/**
 * Atomically write a secret-bearing text file with mode 0o600.
 * Temp file is created with the same mode before rename.
 */
export function writePrivateTextFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: "utf-8", mode: PRIVATE_FILE_MODE });
  replaceFile(tmpPath, filePath);
  chmodPrivate(filePath);
}

/** JSON variant of {@link writePrivateTextFile}. */
export function writePrivateJsonFile(filePath: string, data: unknown): void {
  writePrivateTextFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
