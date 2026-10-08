import { z } from "zod";

const time = z.iso.datetime({ offset: true });
const number = z.number().finite().nonnegative().nullable();
const text = z.string().max(300);
export const CheckSchema = z.object({
  state: z.enum(["ok", "unavailable", "missing", "stale"]),
  reason: z
    .enum([
      "not_configured",
      "not_found",
      "permission_denied",
      "rate_limited",
      "http_error",
      "network",
      "timeout",
      "malformed",
      "no_samples",
      "null_metrics",
      "old_sample",
      "query_failed",
    ])
    .nullable(),
  http_status: z.number().int().nullable(),
  retry_at: time.nullable(),
});
const metric = CheckSchema.extend({ latest_at: time.nullable() });
export const InfrastructureSchema = z.object({
  schema_version: z.literal("admin-infrastructure-v2"),
  availability: z.enum(["ready", "partial", "unavailable"]),
  configuration: z.enum([
    "configured",
    "token_not_configured",
    "account_not_configured",
  ]),
  fetched_at: time,
  window: z.object({
    start: time,
    end: time,
    description: z.literal("rolling_24h"),
  }),
  workers: z
    .array(
      z.object({
        name: text,
        metadata: CheckSchema,
        observability: z.boolean().nullable(),
        schedules: CheckSchema.extend({
          crons: z.array(text).max(100).nullable(),
        }),
        domains: CheckSchema.extend({
          hostnames: z.array(text).max(100).nullable(),
        }),
        exposure: CheckSchema.extend({
          workers_dev: z.boolean().nullable(),
          preview_urls: z.boolean().nullable(),
        }),
        deployment: CheckSchema.extend({
          created_at: time.nullable(),
          versions: z
            .array(
              z.object({
                id: z.uuid(),
                percentage: z.number().min(0).max(100),
              }),
            )
            .max(10)
            .nullable(),
        }),
        metrics: metric.extend({
          requests: number,
          errors: number,
          cpu_ms_p50: number,
          cpu_ms_p99: number,
        }),
      }),
    )
    .max(3),
  d1: z
    .array(
      z.object({
        name: text,
        storage: metric.extend({ storage_bytes: number, source: z.literal("analytics") }),
        metrics: metric.extend({ rows_read: number, rows_written: number }),
      }),
    )
    .max(2),
  r2: z.object({
    name: text,
    storage: metric.extend({
      source: z.literal("analytics"),
      payload_bytes: number,
      metadata_bytes: number,
      objects: number,
    }),
    operations: metric.extend({ requests: number }),
  }),
  plan: z.object({
    value: z.enum(["free", "paid", "unknown"]),
    verification: z.enum(["manual_evidence", "unavailable"]),
    verified_at: time.nullable(),
    evidence: text.nullable(),
  }),
});
export type Infrastructure = z.infer<typeof InfrastructureSchema>;
export type Check = z.infer<typeof CheckSchema>;

// Time since the dashboard received a projection, not time since a Worker last ran.
export const INFRA_STALE_MS = 15 * 60 * 1000;
export function infrastructureStale(report: Infrastructure, now: number) {
  return now - Date.parse(report.fetched_at) > INFRA_STALE_MS;
}
export const checkLabel = (check: Check | undefined) =>
  !check
    ? "Unknown · 未取得"
    : check.state === "ok"
      ? "Healthy"
      : check.state === "missing"
        ? "Warning · 見つかりません"
        : check.state === "stale"
          ? "Warning · 古いサンプル"
          : "Unknown · " +
            {
              not_configured: "未設定",
              permission_denied: "権限不足",
              rate_limited: "Rate limited",
              timeout: "Timeout",
              malformed: "形式不正",
              no_samples: "サンプルなし",
              null_metrics: "null metrics",
              query_failed: "query失敗",
              network: "接続失敗",
              http_error: "HTTP失敗",
              old_sample: "古いサンプル",
              not_found: "未取得",
            }[check.reason ?? "not_configured"];
