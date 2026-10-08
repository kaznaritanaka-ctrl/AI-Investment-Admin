// Synthetic only. These responses/credentials never belong in a production bundle.
import { ACCOUNT_ID } from "../src/infrastructure-targets.ts";
import { emptyInfrastructure } from "../src/infrastructure.ts";
import { NOW, STAMP, json } from "./fixtures.ts";
import type { Infrastructure } from "../src/infrastructure-contract.ts";
export const INFRA_ENV = {
  CF_ACCOUNT_ID: ACCOUNT_ID,
  CLOUDFLARE_READ_TOKEN: "synthetic-server-secret-sentinel",
};
export const VERSION = "11111111-1111-4111-8111-111111111111";
const ok = {
  state: "ok" as const,
  reason: null,
  http_status: 200,
  retry_at: null,
};
export function infrastructureFixture(configured = true): Infrastructure {
  const r = emptyInfrastructure(NOW);
  if (!configured) return r;
  r.configuration = "configured";
  r.availability = "ready";
  for (const w of r.workers) {
    w.metadata = { ...ok };
    w.observability = true;
    w.schedules = {
      ...ok,
      crons: w.name.endsWith("collector")
        ? ["17 18 * * *", "47 18 * * *", "*/5 18-23 * * *"]
        : [],
    };
    w.exposure = { ...ok, workers_dev: false, preview_urls: false };
    w.domains = {
      ...ok,
      hostnames: w.name.endsWith("collector")
        ? []
        : [
            w.name.endsWith("admin")
              ? "admin.fixture.test"
              : "api.fixture.test",
          ],
    };
    w.deployment = {
      ...ok,
      versions: [{ id: VERSION, percentage: 100 }],
      created_at: STAMP,
    };
    w.metrics = {
      ...ok,
      latest_at: STAMP,
      requests: 23,
      errors: 0,
      cpu_ms_p50: 1.25,
      cpu_ms_p99: 3.75,
    };
  }
  for (const d of r.d1) {
    d.storage = { ...ok, storage_bytes: 1048576, latest_at: STAMP, source: "analytics" };
    d.metrics = { ...ok, latest_at: STAMP, rows_read: 1500, rows_written: 25 };
  }
  r.r2.storage = {
    ...ok,
    source: "analytics",
    latest_at: STAMP,
    payload_bytes: 262144,
    metadata_bytes: 512,
    objects: 8,
  };
  r.r2.operations = { ...ok, latest_at: STAMP, requests: 120 };
  r.plan = {
    value: "free",
    verification: "manual_evidence",
    verified_at: STAMP,
    evidence: "Synthetic manual plan evidence",
  };
  return r;
}
export type InfraPatch = (
  url: URL,
  init: RequestInit | undefined,
) => Response | undefined | Promise<Response | undefined>;
export function cloudflareFixture(patch?: InfraPatch): typeof fetch {
  return (async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.cloudflare.com")
      throw new Error("Unexpected fixture origin");
    const replaced = await patch?.(url, init);
    if (replaced) return replaced;
    if (url.pathname.endsWith("/graphql")) {
      const query = JSON.parse(String(init?.body)).query as string;
      const latest = [{ dimensions: { datetime: STAMP } }];
      const body = query.includes("AdminWorkerMetrics")
        ? {
            total: [
              {
                sum: { requests: 23, errors: 0 },
                quantiles: { cpuTimeP50: 1250, cpuTimeP99: 3750 },
              },
            ],
            latest,
          }
        : query.includes("AdminD1Metrics")
          ? { total: [{ sum: { rowsRead: 1500, rowsWritten: 25 } }], latest }
          : query.includes("AdminD1Storage")
            ? { total: [{ max: { databaseSizeBytes: 1048576 }, dimensions: { datetime: STAMP } }] }
          : query.includes("AdminR2Storage")
            ? {
                total: [
                  {
                    max: {
                      payloadSize: 262144,
                      metadataSize: 512,
                      objectCount: 8,
                    },
                    dimensions: { datetime: STAMP },
                  },
                ],
              }
            : { total: [{ sum: { requests: 120 } }], latest };
      return json({
        data: { viewer: { accounts: [body] } },
        errors: null,
        unrelated: "private-sentinel",
      });
    }
    let result: unknown;
    if (url.pathname.endsWith("/script-settings"))
      result = {
        observability: { enabled: true },
        bindings: [{ name: "secret", text: "private-sentinel" }],
      };
    else if (url.pathname.endsWith("/schedules"))
      result = { schedules: [{ cron: "17 18 * * *" }] };
    else if (url.pathname.endsWith("/subdomain"))
      result = { enabled: false, previews_enabled: false };
    else if (url.pathname.endsWith("/deployments"))
      result = {
        deployments: [
          {
            created_on: STAMP,
            versions: [{ version_id: VERSION, percentage: 100 }],
            author_email: "private-sentinel",
          },
        ],
      };
    else if (url.pathname.endsWith("/domains"))
      result = [
        {
          hostname: "admin.fixture.test",
          service: "ai-investment-admin",
          environment: "production",
          cert_id: "private-sentinel",
        },
        { hostname: "unrelated.fixture.test", service: "other-worker" },
      ];
    else throw new Error("Unexpected fixture path");
    return json({ success: true, result, errors: [] });
  }) as typeof fetch;
}
