export type OperationSeverity = "info" | "warning" | "critical";
export type OperationEventType = "authentication_required" | "download_failed" | "signature_degraded" | "health_unhealthy" | "shared_window_conflict" | "update_completed" | "rollback" | "recovery_failed" | "maintenance_over_budget";
export interface OperationEvent {
  sequence: number;
  eventId: string;
  type: OperationEventType;
  severity: OperationSeverity;
  serverUuids: string[];
  modIds: number[];
  batchId: string | null;
  reasonCode: string;
  message: string;
  suggestedAction: string;
  requiresAttention: boolean;
  occurredAt: string;
  updatedAt: string;
  recoveredAt: string | null;
  acknowledgedAt: string | null;
  change: "occurred" | "changed" | "acknowledged" | "recovered" | "snapshot";
}
export interface OperationEventPage {
  items: OperationEvent[];
  nextCursor: number;
  earliestCursor: number;
  hasMore: boolean;
}
export interface MaintenanceResult {
  id: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  serverUuids: string[];
  modIds: number[];
  requiresAttention: boolean;
  result: string | null;
}
export interface NotificationSettings {
  enabled: boolean;
  host: string;
  port: number;
  tls: "starttls" | "tls" | "none";
  username: string;
  from: string;
  recipients: string[];
}
export interface NotificationSettingsData extends NotificationSettings {
  passwordConfigured: boolean;
  readTokenConfigured: boolean;
}
export interface EmailDelivery {
  id: string;
  eventId: string | null;
  sequence: number | null;
  kind: "attention" | "recovery" | "test";
  state: "pending" | "sent" | "failed";
  attempts: number;
  createdAt: string;
  nextAttemptAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  from: string;
  recipients: string[];
  subject: string;
  text: string;
}
