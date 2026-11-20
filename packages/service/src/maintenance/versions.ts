import * as fs from "node:fs";
import * as path from "node:path";
import { parseWorkshopKeyValues, workshopSection } from "../steamcmd/workshop-acf.js";
import { physicalDirectory } from "../util/path-identity.js";
import type { SteamWorkshopModInfo } from "../steamcmd/workshop-api.js";
import type { InstalledWorkshopVersion, RemoteWorkshopVersion } from "../types/maintenance.js";

/** 只接受 content/107410/<id> 对应的已安装条目；同 ID 的其他目录不能借用此记录。 */
export function readInstalledWorkshopVersion(modPath: string, modId: number): InstalledWorkshopVersion | null {
  try {
    const physical = physicalDirectory(modPath);
    const equal = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    const candidate = [path.resolve(modPath), physical.path].find((value) => {
      const app = path.dirname(value); const content = path.dirname(app); const workshop = path.dirname(content);
      return path.basename(value) === String(modId) && path.basename(app) === "107410" && equal(path.basename(content), "content") && equal(path.basename(workshop), "workshop") && fs.existsSync(path.join(workshop, "appworkshop_107410.acf"));
    });
    if (!candidate) return null;
    const acfPath = path.join(path.dirname(path.dirname(path.dirname(candidate))), "appworkshop_107410.acf");
    if (physicalDirectory(path.join(path.dirname(acfPath), "content", "107410", String(modId))).key !== physical.key) return null;
    const document = parseWorkshopKeyValues(fs.readFileSync(acfPath, "utf8"));
    const data = workshopSection(document.AppWorkshop);
    if (data?.appid !== "107410") return null;
    const installed = workshopSection(workshopSection(data.WorkshopItemsInstalled)?.[String(modId)]);
    if (!installed || typeof installed.manifest !== "string" || !/^[1-9]\d*$/.test(installed.manifest)) return null;
    const timeUpdated = Number(installed.timeupdated); const sizeBytes = Number(installed.size);
    if (!Number.isSafeInteger(timeUpdated) || timeUpdated <= 0 || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return null;
    return { timeUpdated, sizeBytes, manifest: installed.manifest, acfPath };
  } catch { return null; }
}

export function remoteWorkshopVersion(info: SteamWorkshopModInfo | undefined): RemoteWorkshopVersion | null {
  if (info?.source !== "api" || !Number.isSafeInteger(info.timeUpdated) || Number(info.timeUpdated) <= 0 || !Number.isSafeInteger(info.fileSizeBytes) || Number(info.fileSizeBytes) <= 0) return null;
  return { timeUpdated: info.timeUpdated!, sizeBytes: info.fileSizeBytes! };
}

/** 时间戳相同但大小不同仍为未知；新本地版本也不能被较旧 API 响应宣称已最新。 */
export function compareWorkshopVersions(local: InstalledWorkshopVersion | null, remote: RemoteWorkshopVersion | null): "outdated" | "up_to_date" | "unknown" {
  if (!local || !remote) return "unknown";
  if (local.timeUpdated < remote.timeUpdated) return "outdated";
  return local.timeUpdated === remote.timeUpdated && local.sizeBytes === remote.sizeBytes ? "up_to_date" : "unknown";
}
