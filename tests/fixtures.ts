// SYNTHETIC ONLY. These simulated public responses never enter the production bundle.
import { StatusSchema, UPSTREAM } from "../src/contracts.ts";
import type { Status, Observation } from "../src/contracts.ts";
export const NOW = Date.parse("2026-09-29T18:35:00Z");
export const STAMP = "2026-09-29T18:18:00.000Z";
export function sourceMetadata(source_id: string) {
  return {
    source_id,
    operator: "Synthetic " + source_id,
    source_url: "https://fixture.test/" + source_id,
    documentation_url: null,
    license_url: "https://fixture.test/license",
    attribution: "Synthetic source attribution",
    rights: {
      automated_access: "allowed" as const,
      public_display: "allowed" as const,
      commercial_reuse:
        source_id === "models_dev"
          ? ("review_required" as const)
          : ("allowed" as const),
    },
    rights_version: "synthetic-policy-v1",
    conditions: ["Synthetic attribution required"],
    coverage: ["Synthetic selected observations"],
    limitations: ["Synthetic coverage limitation; not the whole market"],
  };
}
export function health() {
  return {
    status: "no_public_data",
    environment: "synthetic-test",
    datasets: [],
    collector: {
      last_collector_completed_at: null,
      collection_enabled: 0,
      monitor_connected: 0,
    },
  };
}
export function fx(observed = STAMP): Observation {
  return {
    schema_version: "1",
    observation_id: "synthetic-fx",
    entity_key: "EUR/USD",
    dataset: "fx",
    data_origin: "live",
    observed_at: observed,
    source_date: "2026-09-28",
    source: {
      source_id: "ecb",
      source_url: "https://fixture.test/ecb",
      operator: "Synthetic ECB",
      secondary: false,
    },
    observation_basis: "reference_rate",
    attribution: "Synthetic attribution",
    stale: false,
    stale_reason: null,
    quality_flags: [],
    fx_reference: null,
    reuse: {
      license_url: null,
      conditions: ["Synthetic condition"],
      notice: null,
    },
    value: {
      base_currency: "EUR",
      quote_currency: "USD",
      rate_decimal: "1.234567890123456789",
      reference_rate_type: "ECB_reference",
    },
  };
}
export function ai(observed = STAMP): Observation {
  return {
    ...fx(observed),
    observation_id: "synthetic-ai",
    entity_key: "synthetic-model",
    dataset: "ai_api_prices",
    source: {
      source_id: "models_dev",
      source_url: "https://fixture.test/models",
      operator: "Synthetic Models.dev",
      secondary: true,
    },
    observation_basis: "advertised_quote",
    value: {
      model_id: "Synthetic model",
      serving_provider: "Synthetic provider",
      price_components: [
        {
          component_type: "input",
          amount_decimal: null,
          currency: "USD",
          unit: "million_tokens",
        },
        {
          component_type: "output",
          amount_decimal: "0.123456789012345678",
          currency: "USD",
          unit: "million_tokens",
        },
      ],
    },
  };
}
export function ok<T>(data: T) {
  return {
    state: "ok" as const,
    http_status: 200,
    checked_at: STAMP,
    data,
    issue: null,
    error_kind: null,
    retry_at: null,
  };
}
export function empty() {
  return {
    state: "empty" as const,
    http_status: 404,
    checked_at: STAMP,
    data: null,
    issue: "no_observation",
    error_kind: null,
    retry_at: null,
  };
}
export function failure(
  kind: "http" | "timeout" | "format" | "network" = "http",
) {
  return {
    state: "error" as const,
    http_status: 500,
    checked_at: STAMP,
    data: null,
    issue: "Synthetic failure",
    error_kind: kind,
    retry_at: null,
  };
}
export function report(rows: Observation[] = []): Status {
  return StatusSchema.parse({
    schema_version: "admin-status-v1",
    upstream: UPSTREAM,
    fetched_at: STAMP,
    endpoints: {
      health: ok(health()),
      latest: rows.length ? ok({ schema_version: "1", data: rows }) : empty(),
      sources: ok({ schema_version: "1", data: [] }),
      licenses: ok({
        id: "licenses",
        models_dev_mit: "Synthetic license notice",
      }),
    },
  });
}
export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
export function publicFetch(
  patches: Record<string, () => Response | Promise<Response>> = {},
): typeof fetch {
  return (async (input) => {
    const path = new URL(String(input)).pathname;
    if (patches[path]) return patches[path]();
    return json(
      path === "/health"
        ? health()
        : path === "/v1/latest"
          ? { error: { code: "no_observation" } }
          : path === "/v1/sources"
            ? { schema_version: "1", data: [] }
            : { id: "licenses", models_dev_mit: "Synthetic license" },
      path === "/v1/latest" ? 404 : 200,
    );
  }) as typeof fetch;
}
