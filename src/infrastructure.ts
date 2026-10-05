import { z } from "zod";
import { readJSON, retryAt } from "./network.ts";
import { InfrastructureSchema } from "./infrastructure-contract.ts";
import type { Check, Infrastructure } from "./infrastructure-contract.ts";
import {
  ACCOUNT_ID,
  WORKERS,
  DATABASES,
  BUCKET,
} from "./infrastructure-targets.ts";

// Optional Worker Secret/non-secret declarations; no VITE_ variables or client imports.
export type InfrastructureEnv = {
  CLOUDFLARE_READ_TOKEN?: string;
  // Must match the server allowlist. A token from another account cannot retarget the client.
  CF_ACCOUNT_ID?: string;
  WORKERS_PLAN?: string;
  WORKERS_PLAN_VERIFIED_AT?: string;
  WORKERS_PLAN_EVIDENCE?: string;
};
const API = "https://api.cloudflare.com/client/v4";
const time = z.iso.datetime({ offset: true });
const amount = z.number().finite().nonnegative().nullish();
const string = z.string().max(300);
const timestamp = z.object({ dimensions: z.object({ datetime: time }) });
const workerMetrics = z.object({
  total: z
    .array(
      z.object({
        sum: z.object({ requests: amount, errors: amount }).nullable(),
        quantiles: z
          .object({ cpuTimeP50: amount, cpuTimeP99: amount })
          .nullable(),
      }),
    )
    .max(1),
  latest: z.array(timestamp).max(1),
});
const d1Metrics = z.object({
  total: z
    .array(
      z.object({
        sum: z.object({ rowsRead: amount, rowsWritten: amount }).nullable(),
      }),
    )
    .max(1),
  latest: z.array(timestamp).max(1),
});
const r2Storage = z.object({
  total: z
    .array(
      timestamp.extend({
        max: z
          .object({
            payloadSize: amount,
            metadataSize: amount,
            objectCount: amount,
          })
          .nullable(),
      }),
    )
    .max(1),
});
const r2Operations = z.object({
  total: z
    .array(z.object({ sum: z.object({ requests: amount }).nullable() }))
    .max(1),
  latest: z.array(timestamp).max(1),
});

// Static GraphQL queries only. POST is a read query; no mutation/user-provided query is accepted.
export const WORKER_QUERY = `query AdminWorkerMetrics($account: string!, $name: string!, $start: string!, $end: string!) {
  viewer { accounts(filter:{accountTag:$account}) {
    total:workersInvocationsAdaptive(limit:1,filter:{scriptName:$name,datetime_geq:$start,datetime_leq:$end}) {sum {requests errors} quantiles {cpuTimeP50 cpuTimeP99}}
    latest:workersInvocationsAdaptive(limit:1,filter:{scriptName:$name,datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]) {dimensions {datetime}}
  }}
}`;
export const D1_QUERY = `query AdminD1Metrics($account: string!, $name: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter:{accountTag:$account}) {
    total:d1AnalyticsAdaptiveGroups(limit:1,filter:{databaseId:$name,datetime_geq:$start,datetime_leq:$end}) {sum {rowsRead rowsWritten}}
    latest:d1AnalyticsAdaptiveGroups(limit:1,filter:{databaseId:$name,datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]) {dimensions {datetime}}
  }}
}`;
export const R2_STORAGE_QUERY = `query AdminR2Storage($account: string!, $name: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter:{accountTag:$account}) {
    total:r2StorageAdaptiveGroups(limit:1,filter:{bucketName:$name,datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]) {max {payloadSize metadataSize objectCount} dimensions {datetime}}
  }}
}`;
export const R2_OPERATIONS_QUERY = `query AdminR2Operations($account: string!, $name: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter:{accountTag:$account}) {
    total:r2OperationsAdaptiveGroups(limit:1,filter:{bucketName:$name,datetime_geq:$start,datetime_leq:$end}) {sum {requests}}
    latest:r2OperationsAdaptiveGroups(limit:1,filter:{bucketName:$name,datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]) {dimensions {datetime}}
  }}
}`;
const unavailable = (
  reason: Check["reason"] = "not_configured",
  status: number | null = null,
  retry: string | null = null,
): Check => ({
  state: reason === "not_found" ? "missing" : "unavailable",
  reason,
  http_status: status,
  retry_at: retry,
});
const success = (): Check => ({
  state: "ok",
  reason: null,
  http_status: 200,
  retry_at: null,
});

export function emptyInfrastructure(
  now: number,
  configuration: Infrastructure["configuration"] = "token_not_configured",
): Infrastructure {
  const end = new Date(Math.floor(now / 60000) * 60000).toISOString();
  return {
    schema_version: "admin-infrastructure-v1",
    availability: "unavailable",
    configuration,
    fetched_at: new Date(now).toISOString(),
    window: {
      start: new Date(Date.parse(end) - 86400000).toISOString(),
      end,
      description: "rolling_24h",
    },
    workers: WORKERS.map((name) => ({
      name,
      metadata: unavailable(),
      observability: null,
      schedules: { ...unavailable(), crons: null },
      domains: { ...unavailable(), hostnames: null },
      exposure: { ...unavailable(), workers_dev: null, preview_urls: null },
      deployment: { ...unavailable(), created_at: null, versions: null },
      metrics: {
        ...unavailable(),
        latest_at: null,
        requests: null,
        errors: null,
        cpu_ms_p50: null,
        cpu_ms_p99: null,
      },
    })),
    d1: DATABASES.map((d) => ({
      name: d.name,
      metadata: { ...unavailable(), storage_bytes: null },
      metrics: {
        ...unavailable(),
        latest_at: null,
        rows_read: null,
        rows_written: null,
      },
    })),
    r2: {
      name: BUCKET,
      metadata: unavailable(),
      storage: {
        ...unavailable(),
        latest_at: null,
        payload_bytes: null,
        metadata_bytes: null,
        objects: null,
      },
      operations: { ...unavailable(), latest_at: null, requests: null },
    },
    plan: {
      value: "unknown",
      verification: "unavailable",
      verified_at: null,
      evidence: null,
    },
  };
}

type Result<T> = { check: Check; data: T | null };
export async function collectInfrastructure(
  env: InfrastructureEnv,
  fetcher: typeof fetch = fetch,
  options: { now?: () => number; timeoutMs?: number } = {},
): Promise<Infrastructure> {
  const now = options.now ?? Date.now;
  const out = emptyInfrastructure(now());
  if (!env.CLOUDFLARE_READ_TOKEN?.trim()) return out;
  if (env.CF_ACCOUNT_ID !== ACCOUNT_ID) {
    out.configuration = "account_not_configured";
    return out;
  }
  out.configuration = "configured";
  const controller = new AbortController();
  // One deadline includes queueing + headers + body reads, not 23 serial timeouts.
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10000,
  );
  const base = `/accounts/${ACCOUNT_ID}`;
  let limitedUntil: string | null = null;
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    query?: { query: string; variables: Record<string, string> },
  ): Promise<Result<T>> {
    if (controller.signal.aborted)
      return { check: unavailable("timeout"), data: null };
    if (limitedUntil)
      return {
        check: unavailable("rate_limited", 429, limitedUntil),
        data: null,
      };
    let status: number | null = null;
    try {
      const response = await fetcher(API + path, {
        method: query ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_READ_TOKEN}`,
          Accept: "application/json",
          ...(query ? { "Content-Type": "application/json" } : {}),
        },
        body: query ? JSON.stringify(query) : undefined,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        if (status === 429)
          limitedUntil = retryAt(response.headers.get("retry-after"), now());
        return {
          check: unavailable(
            status === 404
              ? "not_found"
              : [401, 403].includes(status)
                ? "permission_denied"
                : status === 429
                  ? "rate_limited"
                  : "http_error",
            status,
            limitedUntil,
          ),
          data: null,
        };
      }
      const body = await readJSON(response, 256 * 1024);
      let data: unknown;
      if (query) {
        const parsed = z
          .object({
            data: z
              .object({
                viewer: z.object({ accounts: z.array(schema).max(1) }),
              })
              .nullable(),
            errors: z.array(z.unknown()).nullish(),
          })
          .safeParse(body);
        // GraphQL 200 with errors is not a complete observation. Other API tasks still succeed.
        if (!parsed.success) throw new Error("malformed");
        if (parsed.data.errors?.length)
          return { check: unavailable("query_failed", status), data: null };
        data = parsed.data.data?.viewer.accounts[0];
      } else {
        const parsed = z
          .object({ success: z.boolean(), result: z.unknown() })
          .safeParse(body);
        if (!parsed.success) throw new Error("malformed");
        if (!parsed.data.success)
          return { check: unavailable("query_failed", status), data: null };
        data = parsed.data.result;
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new Error("malformed");
      return { check: success(), data: parsed.data };
    } catch (error) {
      // Never return/log upstream errors, headers, bodies, token, account or thrown messages.
      return {
        check: unavailable(
          controller.signal.aborted
            ? "timeout"
            : error instanceof Error &&
                ["malformed", "format", "too_large"].includes(error.message)
              ? "malformed"
              : "network",
          status,
        ),
        data: null,
      };
    }
  }
  const graph = <T>(query: string, name: string, schema: z.ZodType<T>) =>
    request("/graphql", schema, {
      query,
      variables: {
        account: ACCOUNT_ID,
        name,
        start: out.window.start,
        end: out.window.end,
      },
    });
  function sample(
    check: Check,
    latest: string | null,
    values: (number | null)[],
    storage = false,
  ): Check {
    if (check.state !== "ok") return check;
    if (!latest) return unavailable("no_samples", 200);
    // A storage sample may lag. An idle Worker is not itself a stale metrics response.
    if (storage && now() - Date.parse(latest) > 6 * 3600000)
      return { ...success(), state: "stale", reason: "old_sample" };
    if (values.some((v) => v === null)) return unavailable("null_metrics", 200);
    return check;
  }
  const tasks: (() => Promise<void>)[] = [];
  for (const worker of out.workers) {
    const path = `${base}/workers/scripts/${worker.name}`;
    tasks.push(
      async () => {
        const r = await request(
          path + "/script-settings",
          z.object({
            observability: z.object({ enabled: z.boolean() }).nullish(),
          }),
        );
        worker.metadata = r.check;
        worker.observability = r.data?.observability?.enabled ?? null;
      },
      async () => {
        const r = await request(
          path + "/schedules",
          z.object({ schedules: z.array(z.object({ cron: string })).max(100) }),
        );
        worker.schedules = {
          ...r.check,
          crons: r.data?.schedules.map((s) => s.cron) ?? null,
        };
      },
      async () => {
        const r = await request(
          path + "/subdomain",
          z.object({ enabled: z.boolean(), previews_enabled: z.boolean() }),
        );
        worker.exposure = {
          ...r.check,
          workers_dev: r.data?.enabled ?? null,
          preview_urls: r.data?.previews_enabled ?? null,
        };
      },
      async () => {
        const r = await request(
          path + "/deployments",
          z.object({
            deployments: z
              .array(
                z.object({
                  created_on: time,
                  versions: z
                    .array(
                      z.object({
                        version_id: z.uuid(),
                        percentage: z.number().min(0).max(100),
                      }),
                    )
                    .max(10),
                }),
              )
              .max(100),
          }),
        );
        const latest = r.data?.deployments
          .slice()
          .sort(
            (a, b) => Date.parse(b.created_on) - Date.parse(a.created_on),
          )[0];
        worker.deployment = {
          ...(r.data && !latest ? unavailable("no_samples", 200) : r.check),
          created_at: latest?.created_on ?? null,
          versions:
            latest?.versions.map((v) => ({
              id: v.version_id,
              percentage: v.percentage,
            })) ?? null,
        };
      },
      async () => {
        const r = await graph(WORKER_QUERY, worker.name, workerMetrics);
        const s = r.data?.total[0],
          latest = r.data?.latest[0]?.dimensions.datetime ?? null;
        const requests = s?.sum?.requests ?? null,
          errors = s?.sum?.errors ?? null;
        const p50 = s?.quantiles?.cpuTimeP50 ?? null,
          p99 = s?.quantiles?.cpuTimeP99 ?? null;
        worker.metrics = {
          ...sample(r.check, latest, [requests, errors, p50, p99]),
          latest_at: latest,
          requests,
          errors,
          cpu_ms_p50: p50 === null ? null : p50 / 1000,
          cpu_ms_p99: p99 === null ? null : p99 / 1000,
        };
      },
    );
  }
  tasks.push(async () => {
    const r = await request(
      base + "/workers/domains",
      z
        .array(
          z.object({
            hostname: z
              .string()
              .max(253)
              .regex(/^[a-z0-9.-]+$/i),
            service: string,
            environment: string.optional(),
          }),
        )
        .max(1000),
    );
    for (const w of out.workers)
      w.domains = {
        ...r.check,
        hostnames:
          r.data
            ?.filter(
              (d) =>
                d.service === w.name &&
                (!d.environment || d.environment === "production"),
            )
            .map((d) => d.hostname) ?? null,
      };
  });
  for (const [index, target] of DATABASES.entries()) {
    const db = out.d1[index];
    tasks.push(
      async () => {
        const r = await request(
          `${base}/d1/database/${target.id}?fields=uuid,name,file_size`,
          z.object({
            uuid: z.literal(target.id),
            name: z.literal(target.name),
            file_size: amount,
          }),
        );
        db.metadata = { ...r.check, storage_bytes: r.data?.file_size ?? null };
      },
      async () => {
        const r = await graph(D1_QUERY, target.id, d1Metrics),
          s = r.data?.total[0]?.sum;
        const latest = r.data?.latest[0]?.dimensions.datetime ?? null,
          read = s?.rowsRead ?? null,
          written = s?.rowsWritten ?? null;
        db.metrics = {
          ...sample(r.check, latest, [read, written]),
          latest_at: latest,
          rows_read: read,
          rows_written: written,
        };
      },
    );
  }
  tasks.push(
    async () => {
      const r = await request(
        `${base}/r2/buckets/${BUCKET}`,
        z.object({ name: z.literal(BUCKET) }),
      );
      out.r2.metadata = r.check;
    },
    async () => {
      const r = await graph(R2_STORAGE_QUERY, BUCKET, r2Storage),
        s = r.data?.total[0];
      const latest = s?.dimensions.datetime ?? null,
        payload = s?.max?.payloadSize ?? null,
        metadata = s?.max?.metadataSize ?? null,
        objects = s?.max?.objectCount ?? null;
      out.r2.storage = {
        ...sample(r.check, latest, [payload, metadata, objects], true),
        latest_at: latest,
        payload_bytes: payload,
        metadata_bytes: metadata,
        objects,
      };
    },
    async () => {
      const r = await graph(R2_OPERATIONS_QUERY, BUCKET, r2Operations),
        count = r.data?.total[0]?.sum?.requests ?? null,
        latest = r.data?.latest[0]?.dimensions.datetime ?? null;
      out.r2.operations = {
        ...sample(r.check, latest, [count]),
        latest_at: latest,
        requests: count,
      };
    },
  );
  try {
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < tasks.length) await tasks[next++]();
      }),
    );
  } finally {
    clearTimeout(timer);
  }
  // A missing subscription cannot establish Free. Owner evidence is labelled manual, never API-verified.
  if (
    ["free", "paid"].includes(env.WORKERS_PLAN ?? "") &&
    time.safeParse(env.WORKERS_PLAN_VERIFIED_AT).success &&
    (env.WORKERS_PLAN_EVIDENCE?.trim().length ?? 0) > 0 &&
    (env.WORKERS_PLAN_EVIDENCE?.length ?? 301) <= 300 &&
    Date.parse(env.WORKERS_PLAN_VERIFIED_AT!) <= now()
  ) {
    out.plan = {
      value: env.WORKERS_PLAN as "free" | "paid",
      verification: "manual_evidence",
      verified_at: env.WORKERS_PLAN_VERIFIED_AT!,
      evidence: env.WORKERS_PLAN_EVIDENCE!.trim(),
    };
  }
  const checks = [
    ...out.workers.flatMap((w) => [
      w.metadata,
      w.schedules,
      w.domains,
      w.exposure,
      w.deployment,
      w.metrics,
    ]),
    ...out.d1.flatMap((d) => [d.metadata, d.metrics]),
    out.r2.metadata,
    out.r2.storage,
    out.r2.operations,
  ];
  out.availability = checks.every((c) => c.state === "ok")
    ? "ready"
    : checks.some((c) => c.state === "ok")
      ? "partial"
      : "unavailable";
  out.fetched_at = new Date(now()).toISOString();
  // Last outbound boundary: an allowlisted schema strips all unrequested fields.
  return InfrastructureSchema.parse(out);
}
