import { isIP } from "node:net";
import type { NotificationSettings } from "../types/operations.js";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false, host: "", port: 587, tls: "starttls", username: "", from: "", recipients: [],
};
const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export class InvalidNotificationSettings extends Error {}

/** 只接受白名单字段；密码绝不进入配置数据库或浏览器。 */
export function validateNotificationSettings(value: unknown, requireComplete = false): NotificationSettings {
  const fail = (message: string): never => { throw new InvalidNotificationSettings(message); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("通知设置必须是对象");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !Object.hasOwn(DEFAULT_NOTIFICATION_SETTINGS, key))) return fail("通知设置包含不支持的字段；密码只通过 A3ST_SMTP_PASSWORD 配置");
  if (typeof data.enabled !== "boolean" || !Number.isInteger(data.port) || Number(data.port) < 1 || Number(data.port) > 65535) return fail("启用状态或 SMTP 端口无效");
  if (!["starttls", "tls", "none"].includes(String(data.tls))) return fail("请选择 STARTTLS、TLS 或明确的明文连接");
  for (const key of ["host", "username", "from"]) {
    if (typeof data[key] !== "string" || (data[key] as string).length > 254 || /[\r\n\x00]/.test(data[key] as string)) return fail("SMTP 地址或用户名无效");
  }
  if (!Array.isArray(data.recipients) || data.recipients.length > 20 || data.recipients.some((item) => typeof item !== "string" || item.length > 254 || !EMAIL.test(item))) return fail("收件人须为有效邮箱，最多 20 个");
  const result: NotificationSettings = {
    enabled: data.enabled, host: String(data.host).trim(), port: Number(data.port), tls: data.tls as NotificationSettings["tls"],
    username: String(data.username).trim(), from: String(data.from).trim(), recipients: [...new Set(data.recipients as string[])],
  };
  if (result.host && !isIP(result.host) && !/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(result.host)) return fail("SMTP 主机只能填写主机名或 IP，不含协议或路径");
  if (result.from && !EMAIL.test(result.from)) return fail("发件人须为有效邮箱地址");
  if ((result.enabled || requireComplete) && (!result.host || !result.from || !result.recipients.length)) return fail("请填写 SMTP 主机、发件人和收件人");
  return result;
}
