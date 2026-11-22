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

/** Guard 提示已出现，且手机批准后 SteamCMD 打印了完成标记。 */
function guardPromptCompleted(logText: string): boolean {
  return (
    /Waiting for confirmation\.\.\.\s*OK/i.test(logText)
    || /Waiting for user confirmation[^\r\n]*OK/i.test(logText)
  );
}

/** 登录已越过 Guard，进入可用会话（含 app_update 成功）。 */
function loginSessionReady(logText: string): boolean {
  return (
    guardPromptCompleted(logText)
    || /Logged in OK/i.test(logText)
    || /Waiting for user info\.\.\.\s*OK/i.test(logText)
    || /Success!\s+App\s+'\d+'\s+fully installed/i.test(logText)
  );
}

/** 从 SteamCMD 控制台输出推断登录阶段。 */
export function detectAuthStateFromOutput(logText: string): SteamCmdAuthState | null {
  if (!logText) {
    return null;
  }
  if (/Invalid Password|Login Failure|FAILED.*login|Failed to authenticate/i.test(logText)) {
    return "auth_failed";
  }
  // 完整日志常同时含 “Waiting for confirmation” 与后续 “...OK / Success!”：
  // 必须先认完成，否则会把已成功的 update_server 误判成仍在等 Guard。
  if (loginSessionReady(logText) || /Logging in using cached credentials/i.test(logText)) {
    return "authenticated";
  }
  if (
    /Waiting for user confirmation|Waiting for confirmation|Steam Guard|Two-factor|two-factor|mobile authenticator/i
      .test(logText)
  ) {
    return "waiting_guard";
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
