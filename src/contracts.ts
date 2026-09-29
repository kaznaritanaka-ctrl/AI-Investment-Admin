import { z } from "zod";

// Read-only contract from AI-Investment-APIs commit 25f4983158d11dafcac32b9c52ea3e3936d0f651.
// Validate fields used by the UI; passthrough preserves additional public metadata for inspection.
export const UPSTREAM = "https://api.ai-investment-research.net";
export const INITIAL_SLOT = "2026-09-30T03:17:00+09:00";
export const TARGETS = [
  { id: "ecb", name: "ECB", dataset: "fx" },
  { id: "models_dev", name: "Models.dev", dataset: "ai_api_prices" },
] as const;
const time = z.iso.datetime({ offset: true });
const text = z.string().max(20000);
const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const safeURL = z
  .url()
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "http(s) URL required",
  );
export const HealthSchema = z
  .object({
    status: z.enum(["no_public_data", "public_data_available"]),
    environment: text,
    datasets: z
      .array(
        z
          .object({
            dataset: text,
            count: z.number().int().nonnegative(),
            last_observed_at: time.nullable(),
          })
          .passthrough(),
      )
      .max(100),
    collector: z
      .object({
        last_collector_completed_at: time.nullable(),
        collection_enabled: z.union([z.literal(0), z.literal(1)]),
        monitor_connected: z.union([z.literal(0), z.literal(1)]),
      })
      .passthrough(),
  })
  .passthrough();
const source = z
  .object({
    source_id: text,
    source_url: safeURL,
    operator: text,
    secondary: z.boolean(),
  })
  .passthrough();
const observation = z
  .object({
    schema_version: z.literal("1"),
    observation_id: text,
    entity_key: text,
    data_origin: z.enum(["live", "synthetic"]),
    observed_at: time,
    source_date: z.iso.date().nullish(),
    source,
    observation_basis: text,
    attribution: text,
    stale: z.boolean(),
    stale_reason: text.nullable(),
    quality_flags: z.array(text),
    reuse: z
      .object({
        license_url: safeURL.nullable(),
        conditions: z.array(text),
        notice: text.nullable(),
      })
      .passthrough(),
    fx_reference: z
      .object({
        fx_source_date: z.iso.date(),
        fx_observed_at: time,
        fx_carried_forward: z.boolean(),
        fx_age: z.number().int().nonnegative(),
        calendar_closed: z.boolean(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();
export const FXSchema = observation.extend({
  dataset: z.literal("fx"),
  value: z
    .object({
      base_currency: text.nullish(),
      quote_currency: text.nullish(),
      rate_decimal: decimal.nullish(),
      reference_rate_type: z
        .enum(["ECB_reference", "project_calculation"])
        .nullish(),
    })
    .passthrough(),
});
export const AISchema = observation.extend({
  dataset: z.literal("ai_api_prices"),
  value: z
    .object({
      model_id: text.nullish(),
      model_author: text.nullish(),
      serving_provider: text.nullish(),
      pricing_scope: text.nullish(),
      billing_notes: text.nullish(),
      tax_status: text.nullish(),
      price_components: z
        .array(
          z
            .object({
              component_type: text.nullish(),
              amount_decimal: decimal.nullish(),
              currency: text.nullish(),
              unit: text.nullish(),
              tier_conditions: text.nullish(),
              cache_ttl: text.nullish(),
            })
            .passthrough(),
        )
        .max(100)
        .nullish(),
    })
    .passthrough(),
});
// Future GPU rows remain visible only in JSON, never counted as the two target datasets.
const otherObservation = observation.extend({
  dataset: z.enum(["gpu_rental", "gpu_secondary"]),
  value: z.record(z.string(), z.unknown()),
});
export const ObservationSchema = z.discriminatedUnion("dataset", [
  FXSchema,
  AISchema,
  otherObservation,
]);
export const LatestSchema = z
  .object({
    schema_version: z.literal("1"),
    data: z.array(ObservationSchema).max(100),
  })
  .passthrough();
const rights = z.record(
  z.string(),
  z.enum(["allowed", "denied", "review_required", "expired"]),
);
export const SourcesSchema = z
  .object({
    schema_version: z.literal("1"),
    data: z
      .array(
        z
          .object({
            source_id: text,
            operator: text,
            source_url: safeURL,
            documentation_url: safeURL.nullable(),
            license_url: safeURL.nullable(),
            attribution: text,
            rights,
            rights_version: text,
            conditions: z.array(text),
            coverage: z.array(text),
            limitations: z.array(text),
          })
          .passthrough(),
      )
      .max(100),
  })
  .passthrough();
export const LicensesSchema = z
  .object({ id: z.literal("licenses"), models_dev_mit: text })
  .passthrough();
export const ErrorSchema = z.object({ error: z.object({ code: z.string() }) });
export const ENDPOINTS = {
  health: { path: "/health", schema: HealthSchema },
  latest: { path: "/v1/latest", schema: LatestSchema },
  sources: { path: "/v1/sources", schema: SourcesSchema },
  licenses: { path: "/v1/methodology/licenses", schema: LicensesSchema },
} as const;
export type EndpointKey = keyof typeof ENDPOINTS;
const endpoint = <T extends z.ZodType>(schema: T) =>
  z
    .object({
      state: z.enum(["ok", "empty", "error"]),
      http_status: z.number().int().nullable(),
      checked_at: time,
      data: schema.nullable(),
      issue: text.nullable(),
      error_kind: z
        .enum(["http", "network", "timeout", "format", "too_large"])
        .nullable(),
      retry_at: time.nullable(),
    })
    .refine(
      (v) =>
        "data" in v &&
        (v.state === "ok"
          ? v.data !== null && v.issue === null
          : v.data === null),
    )
    .refine((v) =>
      v.state === "error"
        ? v.error_kind !== null && v.issue !== null
        : v.error_kind === null,
    );
export const StatusSchema = z.object({
  schema_version: z.literal("admin-status-v1"),
  fetched_at: time,
  upstream: z.literal(UPSTREAM),
  endpoints: z.object({
    health: endpoint(HealthSchema),
    latest: endpoint(LatestSchema),
    sources: endpoint(SourcesSchema),
    licenses: endpoint(LicensesSchema),
  }),
});
export type Status = z.infer<typeof StatusSchema>;
export type EndpointResult<T> = {
  state: "ok" | "empty" | "error";
  http_status: number | null;
  checked_at: string;
  data: T | null;
  issue: string | null;
  error_kind: "http" | "network" | "timeout" | "format" | "too_large" | null;
  retry_at: string | null;
};
export type Observation = z.infer<typeof ObservationSchema>;
export type FX = z.infer<typeof FXSchema>;
export type AI = z.infer<typeof AISchema>;
export type Health = z.infer<typeof HealthSchema>;
