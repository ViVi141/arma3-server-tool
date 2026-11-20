import nodemailer from "nodemailer";
import type { EmailDelivery, NotificationSettings } from "../types/operations.js";
import type { OperationsStore } from "./store.js";

export type SendEmail = (settings: NotificationSettings, delivery: EmailDelivery) => Promise<void>;

export const sendSmtpEmail: SendEmail = async (settings, delivery) => {
  const password = process.env.A3ST_SMTP_PASSWORD;
  if (settings.username && !password) throw Object.assign(new Error("SMTP 密码未配置"), { code: "SMTP_PASSWORD_MISSING" });
  const transport = nodemailer.createTransport({
    host: settings.host, port: settings.port, secure: settings.tls === "tls",
    requireTLS: settings.tls === "starttls", ignoreTLS: settings.tls === "none",
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: settings.username ? { user: settings.username, pass: password } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    const result = await transport.sendMail({
      from: delivery.from, to: delivery.recipients, subject: delivery.subject, text: delivery.text,
      messageId: `<${delivery.id}@a3st.local>`,
    });
    if (result.rejected?.length) throw Object.assign(new Error("部分收件人拒收"), { code: "EENVELOPE" });
  } finally { transport.close(); }
};

function safeErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "SMTP_PASSWORD_MISSING") return code;
  if (code === "EAUTH") return "SMTP_AUTH";
  if (["ETLS", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code)) return "SMTP_TLS";
  if (["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "EDNS", "ESOCKET"].includes(code)) return "SMTP_CONNECT";
  if (["EENVELOPE", "EMESSAGE"].includes(code)) return "SMTP_REJECTED";
  return "SMTP_SEND_FAILED";
}

/** 单实例串行发送。SMTP 已接收但状态落盘前退出可能重复投递，沿用固定 Message-ID。 */
export class EmailNotifier {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private closed = false;
  constructor(private store: OperationsStore, private send: SendEmail = sendSmtpEmail, private onPersistenceError: () => void = () => {}) {}
  start(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => { void this.tick(); }, 1000);
    this.timer.unref();
    void this.tick();
  }
  tick(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.deliverOne().catch(() => { this.onPersistenceError(); }).finally(() => { this.pending = null; });
    return this.pending;
  }
  private async deliverOne(): Promise<void> {
    const delivery = this.store.nextEmail();
    if (!delivery) return;
    let failure: string | null = null;
    try { await this.send(this.store.notificationSettings(), delivery); }
    catch (error) { failure = safeErrorCode(error); }
    // 网络失败不向调用方抛出，不影响运维状态机；落盘失败保留待发送证据。
    this.store.settleEmail(delivery.id, failure);
  }
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.pending;
  }
}
