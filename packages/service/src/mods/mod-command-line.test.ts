import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildModList,
  formatModParameter,
  stripModParameters,
} from "./mod-command-line.js";

describe("mod-command-line", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-mod-cmd-"));
  });

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("formatModParameter converts server relative path to @ token", () => {
    const serverDir = path.join(tmpDir, "server");
    const clientModDir = path.join(serverDir, "client");
    fs.mkdirSync(path.join(clientModDir, "addons"), { recursive: true });

    const formatted = formatModParameter(serverDir, clientModDir, "client");
    expect(formatted).toBe("@client");
  });

  it("buildModList deduplicates entries", () => {
    const serverDir = path.join(tmpDir, "server");
    const clientModDir = path.join(serverDir, "client");
    fs.mkdirSync(path.join(clientModDir, "addons"), { recursive: true });

    const list = buildModList(
      serverDir,
      [
        { modPath: clientModDir, modDirName: "client" },
        { modPath: clientModDir, modDirName: "client" },
      ],
      false
    );
    expect(list).toBe("@client");
  });

  it("stripModParameters removes mod flags", () => {
    const next = stripModParameters('-port=2302 -mod=@old -serverMod=@x');
    expect(next).toBe("-port=2302");
  });
});
