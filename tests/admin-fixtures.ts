// Synthetic operational DTOs, never bundled into the application.
import { AdminReport } from "../src/admin-contract.ts";
import type {
  Report,
  RunDTO,
  SourceDTO,
  DataDTO,
  Resource,
} from "../src/admin-contract.ts";
import { STAMP } from "./fixtures.ts";
export const SLOT = "2026-09-29T18:17:00.000Z";
export const READ_AT = "2026-09-29T18:35:00.000Z";
export function run(source = "ecb"): RunDTO {
  return {
    run_id: source + "-run",
    canonical_run_id: source + "-run",
    source_id: source,
    logical_slot: SLOT,
    scheduled_for: SLOT,
    state: "complete",
    started_at: SLOT,
    finished_at: STAMP,
    last_progress_at: STAMP,
    observation_count: 2,
    accepted_count: 2,
    quarantined_count: 0,
    error_code: null,
    recovery_count: 0,
    next_attempt_at: null,
    publication: {
      state: "complete",
      original_count: 2,
      derived_count: 1,
      visible_count: 3,
      completed_at: STAMP,
    },
    checkpoints: [],
    attempts: [
      {
        attempt: 1,
        started_at: SLOT,
        status: 200,
        code: "unknown",
        duration_ms: 120,
      },
    ],
    invocations: [
      {
        id: "summary",
        kind: "watchdog",
        scheduled_at: STAMP,
        recorded_at: STAMP,
        state: "complete",
        reason: "already_processed",
        notification: "not_configured",
        attempts: 0,
        sent_at: null,
      },
    ],
    details_truncated: false,
  };
}
export function sourceDTO(id = "ecb"): SourceDTO {
  return {
    source_id: id,
    name: id === "ecb" ? "ECB" : id === "models_dev" ? "Models.dev" : id,
    dataset: id === "ecb" ? "fx" : "ai_api_prices",
    adapter_available: true,
    enabled: true,
    registered: true,
    suspended: false,
    collection_allowed: true,
    publication_allowed: true,
    blockers: [],
    latest_observed_at: STAMP,
    source_date: id === "ecb" ? "2026-09-28" : null,
    freshness: "healthy",
    freshness_reason: null,
    last_run: run(id),
    source_url: "https://fixture.test/",
    attribution: "Synthetic attribution",
    coverage: ["synthetic scope"],
    limitations: ["Synthetic limitation"],
  };
}
export function dataRow(i = 0): DataDTO {
  const fields = [
    { name: "model_id", value: "synthetic-model-" + i, unit: null },
    { name: "price_components.0.component_type", value: "input", unit: null },
    {
      name: "price_components.0.amount_decimal",
      value: "0.1234567890123456789",
      unit: "USD / million_tokens",
    },
    {
      name: "price_components.0.tier_conditions",
      value: "synthetic tier A",
      unit: null,
    },
    { name: "price_components.1.component_type", value: "output", unit: null },
    {
      name: "price_components.1.amount_decimal",
      value: null,
      unit: "USD / million_tokens",
    },
  ];
  return {
    observation_id: "model-" + i,
    source_id: "models_dev",
    dataset: "ai_api_prices",
    entity_key: "synthetic-model-" + i,
    run_id: "models_dev-run",
    snapshot_id: "synthetic-snapshot",
    observed_at: STAMP,
    recorded_at: STAMP,
    source_period: null,
    quality: "accepted",
    data_origin: "synthetic",
    policy_version: "synthetic-policy",
    supersedes_id: null,
    retention_until: "2030-01-01T00:00:00.000Z",
    private_readable: true,
    private_blocker: null,
    fields,
    public_fields: structuredClone(fields),
    previous_fields: [],
    publication: run().publication,
    issues: [],
    attribution: "Synthetic attribution",
    source_url: "https://fixture.test/",
    conditions: ["Synthetic condition"],
    license_notice: "Synthetic license notice",
    related_ids: [],
    derived: false,
  };
}
export function operational(
  resource: Resource,
  query = new URLSearchParams(),
): Report {
  const r: Report = {
    schema_version: "admin-read-v1",
    resource,
    fetched_at: READ_AT,
    as_of: READ_AT,
    state: "ready",
    issues: [],
    next_cursor: null,
  };
  const list = [sourceDTO(), sourceDTO("models_dev")].filter(
    (s) => !query.get("source") || s.source_id === query.get("source"),
  );
  if (resource === "overview")
    r.overview = {
      logical_slot: SLOT,
      expected: 2,
      completed: 2,
      published: 2,
      fresh: 2,
      checked_sources: 2,
      attention: [],
      sources: list,
    };
  if (resource === "sources") r.sources = list;
  if (resource === "runs")
    r.runs = list
      .map((s) => s.last_run!)
      .filter((s) => !query.get("run") || s.run_id === query.get("run"));
  if (resource === "data") {
    const start = Number(query.get("cursor") ?? 0);
    r.data = query.has("id")
      ? [dataRow(Number(query.get("id")!.replace("model-", "")) || 0)]
      : Array.from({ length: Math.min(50, 125 - start) }, (_, i) =>
          dataRow(i + start),
        );
    if (!query.has("id") && start + 50 < 125)
      r.next_cursor = String(start + 50);
    if (query.get("dataset") === "electricity") {
      r.state = "not_supported";
      r.issues = ["electricity_adapter_not_deployed"];
      r.data = [];
      r.next_cursor = null;
    }
  }
  if (resource === "rights")
    r.policies = [
      {
        source_id: "models_dev",
        version: "synthetic-policy",
        current: true,
        runtime_matches: true,
        recorded_at: STAMP,
        rights: Object.fromEntries(
          [
            "automated_collection",
            "private_storage",
            "internal_analysis",
            "external_llm_processing",
            "public_display",
            "raw_redistribution",
            "normalized_redistribution",
            "derived_redistribution",
            "commercial_redistribution",
          ].map((k) => [
            k,
            k === "external_llm_processing" || k === "raw_redistribution"
              ? "denied"
              : "allowed",
          ]),
        ),
        valid_from: SLOT,
        valid_until: "2026-10-05T00:00:00.000Z",
        days_remaining: 6,
        expiry: "seven_days",
        collection_allowed: true,
        publication_allowed: true,
        blockers: [],
        fields: ["models_projection_v2"],
        conditions: ["Synthetic license condition"],
        evidence_refs: ["docs/synthetic.md"],
        checked_at: STAMP,
        retention: [{ name: "normalized_days", value: 1095, unit: "days" }],
        license_url: "https://fixture.test/license",
        attribution: "Synthetic attribution",
        license_notice: "Synthetic license",
      },
    ];
  if (resource === "settings")
    r.settings = [
      {
        source_id: null,
        name: "Collector runtime",
        runtime: [
          { name: "collection_cron", value: "17 18 * * *", unit: null },
          { name: "watchdog_cron", value: "47 18 * * *", unit: null },
          { name: "continuation_cron", value: "*/5 18-23 * * *", unit: null },
          { name: "notification_configured", value: false, unit: null },
        ],
        stored: [],
        matches: null,
        blockers: ["notification_not_configured"],
      },
    ];
  if (resource === "releases")
    r.releases = {
      records: [],
      migrations: [
        {
          database: "private",
          name: "0005_admin_release_ledger.sql",
          applied_at: STAMP,
        },
      ],
      ledger_available: true,
    };
  return AdminReport.parse(r);
}
