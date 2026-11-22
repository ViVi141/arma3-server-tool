/** Mirrors legacy SteamCmdService workshop / dedicated-server argument builders. */

import type { SteamCmdLoginMode } from "./login-mode.js";

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

/**
 * 构建 +login 子句。
 * cached：只传用户名，完全省略密码参数（依赖 config/config.vdf）。
 * password：传用户名 + 密码。
 */
export function buildLoginClause(
  username: string,
  password: string,
  loginMode: SteamCmdLoginMode = "password",
): string {
  const user = quoteSteamCmdArgument(username);
  if (loginMode === "cached") {
    return `+login ${user}`;
  }
  return `+login ${user} ${quoteSteamCmdArgument(password)}`;
}

export interface SteamCmdArgOptions {
  validate?: boolean;
  loginMode?: SteamCmdLoginMode;
}

/** Same as SteamCmdService.BuildWorkshopDownloadArguments (+ optional validate / loginMode). */
export function buildWorkshopDownloadArguments(
  username: string,
  password: string,
  workshopRoot: string,
  modIds: readonly number[],
  options: SteamCmdArgOptions = {},
): string {
  const loginMode = options.loginMode ?? "password";
  let builder =
    `+force_install_dir "${workshopRoot}" ${buildLoginClause(username, password, loginMode)}`;

  const seen = new Set<number>();
  for (let i = 0; i < modIds.length; i++) {
    const modId = modIds[i];
    if (modId === 0 || seen.has(modId)) {
      continue;
    }
    seen.add(modId);
    if (options.validate) {
      builder += ` +workshop_download_item ${ARMA3_WORKSHOP_APP_ID} ${modId} validate`;
    } else {
      builder += ` +workshop_download_item ${ARMA3_WORKSHOP_APP_ID} ${modId}`;
    }
  }

  builder += " +quit";
  return builder;
}

/** Same as SteamCmdService dedicated server captured update arguments. */
export function buildDedicatedServerUpdateArguments(
  username: string,
  password: string,
  installDir: string,
  options: { loginMode?: SteamCmdLoginMode } = {},
): string {
  const loginMode = options.loginMode ?? "password";
  const isLinux = process.platform === "linux";
  const appUpdate = isLinux
    ? `+app_update ${ARMA3_DEDICATED_APP_ID} validate`
    : `+app_update ${ARMA3_DEDICATED_APP_ID} -beta creatordlc validate`;
  return (
    `+force_install_dir "${installDir}" ${buildLoginClause(username, password, loginMode)}`
    + ` ${appUpdate} +quit`
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

const LOGIN_PASSWORD_TOKEN_RE =
  /(\+login\s+(?:"(?:\\.|[^"\\])*"|\S+)\s+)(?![+-])("(?:\\.|[^"\\])*"|\S+)/gi;

/** Same as SteamCmdProcessRunner password redaction in log files. */
export function redactPasswordInArguments(argumentsString: string, password?: string): string {
  if (!argumentsString) {
    return argumentsString;
  }
  let result = argumentsString.replace(LOGIN_PASSWORD_TOKEN_RE, '$1"***"');
  if (!password) {
    return result;
  }
  const quoted = quoteSteamCmdArgument(password);
  const escaped = quoted.slice(1, -1);
  result = result.replaceAll(quoted, '"***"');
  if (escaped && escaped !== password) {
    result = result.replaceAll(escaped, "***");
  }
  return result.replaceAll(password, "***");
}

/** Redact SteamCMD passwords and +login password tokens from live console chunks. */
export function redactSteamCmdConsoleChunk(chunk: string, password?: string): string {
  if (!chunk) {
    return chunk;
  }
  let result = chunk.replace(
    /(\[调试\]\s*ProcessStartInfo\.Arguments:\s*)(.+)/g,
    (_m, prefix: string, argsPart: string) =>
      `${prefix}${redactPasswordInArguments(argsPart, password)}`
  );
  result = result.replace(LOGIN_PASSWORD_TOKEN_RE, '$1"***"');
  if (!password) {
    return result;
  }
  const quoted = quoteSteamCmdArgument(password);
  const escaped = quoted.slice(1, -1);
  result = result.replaceAll(quoted, '"***"');
  if (escaped && escaped !== password) {
    result = result.replaceAll(escaped, "***");
  }
  // Always redact even short passwords (<4); length checks previously leaked them.
  return result.replaceAll(password, "***");
}
