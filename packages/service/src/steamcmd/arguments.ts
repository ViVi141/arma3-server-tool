/** Mirrors legacy SteamCmdService workshop / dedicated-server argument builders. */

export const ARMA3_DEDICATED_APP_ID = 233780;
export const ARMA3_WORKSHOP_APP_ID = 107410;

/** Same as SteamCmdService.QuoteSteamCmdArgument. */
export function quoteSteamCmdArgument(value: string | null | undefined): string {
  if (value == null) {
    return "\"\"";
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `"${escaped}"`;
}

/** Same as SteamCmdService.BuildWorkshopDownloadArguments. */
export function buildWorkshopDownloadArguments(
  username: string,
  password: string,
  workshopRoot: string,
  modIds: readonly number[],
): string {
  let builder = `+force_install_dir "${workshopRoot}" +login ${quoteSteamCmdArgument(username)} ${quoteSteamCmdArgument(password)}`;

  const seen = new Set<number>();
  for (let i = 0; i < modIds.length; i++) {
    const modId = modIds[i];
    if (modId === 0 || seen.has(modId)) {
      continue;
    }
    seen.add(modId);
    builder += ` +workshop_download_item ${ARMA3_WORKSHOP_APP_ID} ${modId}`;
  }

  builder += " +quit";
  return builder;
}

/** Same as SteamCmdService dedicated server captured update arguments. */
export function buildDedicatedServerUpdateArguments(
  username: string,
  password: string,
  installDir: string,
): string {
  return (
    `+force_install_dir "${installDir}" +login ${quoteSteamCmdArgument(username)} ${quoteSteamCmdArgument(password)}`
    + ` +app_update ${ARMA3_DEDICATED_APP_ID} -beta creatordlc validate +quit`
  );
}

/** Same as SteamCmdService.CountDistinctModIds. */
export function countDistinctModIds(modIds: readonly number[]): number {
  const seen = new Set<number>();
  for (let i = 0; i < modIds.length; i++) {
    const modId = modIds[i];
    if (modId !== 0) {
      seen.add(modId);
    }
  }
  return seen.size;
}

/** Same as SteamCmdProcessRunner password redaction in log files. */
export function redactPasswordInArguments(argumentsString: string, password: string): string {
  if (!argumentsString || !password) {
    return argumentsString;
  }
  return argumentsString.replaceAll(password, "***");
}
