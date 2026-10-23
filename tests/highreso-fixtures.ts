import type {
  HighresoRunsDTO,
  HighresoLatestPricesDTO,
} from "../src/admin-highreso-contract.ts";
export function highresoFixture() {
  const source = {
    source_id: "highreso_public" as const,
    source_url: "https://example.test/source",
    attribution_text: "合成テスト出典",
    terms_url: "https://example.test/terms",
    license_url: null,
  };
  const runs: HighresoRunsDTO = {
    schema_version: "highreso-admin-v1",
    visibility: "private_only",
    source,
    runs: [
      {
        run_id: "synthetic-run",
        run_date_jst: "2026-10-23",
        scheduled_for: "2026-10-22T18:00:00Z",
        state: "partial",
        observation_count: 48,
        last_error: "timeout",
      },
    ],
  };
  const prices: HighresoLatestPricesDTO = {
    schema_version: "highreso-admin-v1",
    visibility: "private_only",
    source,
    run_id: "synthetic-complete",
    observed_at: "2026-10-22T18:01:00Z",
    history_truncated: true,
    prices: ["hour", "month"].map((key, i) => ({
      record_key: key,
      gpu_model: "Synthetic GPU",
      gpu_count: null,
      price_jpy: i ? null : "123.45000000000001",
      unit: i ? "month" : "node_hour",
      tax_status: "unknown",
      first_seen: null,
      last_changed: "2026-10-22T18:01:00Z",
    })),
  };
  return { runs, prices };
}
