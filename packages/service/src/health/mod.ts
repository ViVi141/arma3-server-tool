import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { replaceFile } from "../util/replace-file.js";

export const HEALTH_MOD_NAME = "@a3st_health";
export const HEALTH_MARKER = "A3ST_HEALTH_V1|";

// 源码随 Service 编译，桌面与 Linux 使用同一个打包器，不依赖外部 DLL 或 filePatching。
const CONFIG = `class CfgPatches {
  class a3st_health { units[] = {}; weapons[] = {}; requiredVersion = 2.00; requiredAddons[] = {"A3_Functions_F"}; };
};
class CfgFunctions {
  class A3STHealth {
    class Health {
      file = "\\a3st_health";
      class heartbeat { postInit = 1; };
    };
  };
};
`;
const SCRIPT = `if (!isServer || !isDedicated) exitWith {};
[] spawn {
  private _epoch = diag_tickTime;
  private _seq = 0;
  while {true} do {
    _seq = _seq + 1;
    diag_log format ["A3ST_HEALTH_V1|%1|%2|%3|%4|%5|%6|%7|%8", _epoch, _seq, toArray missionName, toArray worldName, diag_tickTime, time, diag_fps, systemTimeUTC];
    uiSleep 15;
  };
};
`;

/** 确定性未压缩 PBO：固定条目顺序、零时间戳、prefix 扩展和 SHA-1 尾校验。 */
export function buildHealthPbo(): Buffer {
  const files = [["config.cpp", CONFIG], ["fn_heartbeat.sqf", SCRIPT]] as const;
  const extension = Buffer.alloc(21);
  extension.writeUInt32LE(0x56657273, 1);
  const headers = [extension, Buffer.from("prefix\0a3st_health\0\0")];
  const contents: Buffer[] = [];
  for (const [name, text] of files) {
    const content = Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
    const header = Buffer.alloc(20);
    header.writeUInt32LE(content.length, 16);
    headers.push(Buffer.from(`${name}\0`), header);
    contents.push(content);
  }
  const body = Buffer.concat([...headers, Buffer.alloc(21), ...contents]);
  return Buffer.concat([body, Buffer.from([0]), createHash("sha1").update(body).digest()]);
}

export function healthModPath(profileRoot: string): string {
  return path.join(profileRoot, HEALTH_MOD_NAME);
}

/** 每实例单独部署，避免重写另一正在运行实例加载的模组。 */
export function deployHealthMod(profileRoot: string): string {
  const target = path.join(healthModPath(profileRoot), "addons", "a3st_health.pbo");
  const bytes = buildHealthPbo();
  if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) return target;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  replaceFile(temporary, target);
  return target;
}

export function healthModMatches(profileRoot: string): boolean {
  try {
    return fs.readFileSync(path.join(healthModPath(profileRoot), "addons", "a3st_health.pbo")).equals(buildHealthPbo());
  } catch {
    return false;
  }
}
