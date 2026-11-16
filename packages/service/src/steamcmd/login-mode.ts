/** SteamCMD 登录策略：缓存优先（只传用户名）或显式密码。 */
export type SteamCmdLoginMode = "cached" | "password";

/** 对外可观测的登录/Guard 状态（不包含密码或令牌）。 */
export type SteamCmdAuthState =
  | "idle"
  | "cached_login"
  | "password_login"
  | "waiting_guard"
  | "guard_timeout"
  | "auth_failed"
  | "authenticated";

export function normalizeLoginMode(raw: unknown): SteamCmdLoginMode {
  if (raw === "cached") {
    return "cached";
  }
  return "password";
}

/** 从 SteamCMD 控制台输出推断登录阶段。 */
export function detectAuthStateFromOutput(logText: string): SteamCmdAuthState | null {
  if (!logText) {
    return null;
  }
  if (
    /Waiting for user confirmation|Waiting for confirmation|Steam Guard|Two-factor|two-factor|mobile authenticator/i
      .test(logText)
  ) {
    return "waiting_guard";
  }
  if (/Invalid Password|Login Failure|FAILED.*login|Failed to authenticate/i.test(logText)) {
    return "auth_failed";
  }
  if (/Logging in using cached credentials|Logged in OK/i.test(logText)) {
    return "authenticated";
  }
  if (/Logging in using username\/password/i.test(logText)) {
    return "password_login";
  }
  return null;
}

export function authStateLabel(state: SteamCmdAuthState): string {
  switch (state) {
    case "cached_login":
      return "缓存登录";
    case "password_login":
      return "密码登录";
    case "waiting_guard":
      return "等待手机确认";
    case "guard_timeout":
      return "验证超时";
    case "auth_failed":
      return "认证失败";
    case "authenticated":
      return "已登录";
    default:
      return "空闲";
  }
}
