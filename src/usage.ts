import { z } from "zod";
import { UsageSchema, UsagePeriod, UsageDay, UsageEndpoint, UsageCountry, UsageCell } from "./contracts.ts";
import { ACCOUNT_ID } from "./infrastructure-targets.ts";
import type { InfrastructureEnv } from "./infrastructure.ts";
import { readJSON } from "./network.ts";
export function usageSQL(value: unknown) {
  const period = UsagePeriod.parse(value);
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
  const base = ` FROM api_usage_v1 WHERE timestamp > NOW() - INTERVAL '${days}' DAY`;
  const calls = "SUM(_sample_interval * double1)";
  return [
    `SELECT formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS day, blob3 AS statusClass, ${calls} AS calls${base} GROUP BY day, statusClass ORDER BY day FORMAT JSON`,
    `SELECT blob1 AS route, ${calls} AS calls, sumIf(_sample_interval * double1, blob3 = '429') AS rateLimited, sumIf(_sample_interval * double1, blob3 = '5xx') AS errors${base} GROUP BY route ORDER BY calls DESC LIMIT 200 FORMAT JSON`,
    `SELECT blob2 AS country, ${calls} AS calls${base} GROUP BY country ORDER BY calls DESC LIMIT 300 FORMAT JSON`,
    `SELECT blob1 AS route, blob2 AS country, ${calls} AS calls${base} GROUP BY route, country ORDER BY calls DESC LIMIT 100 FORMAT JSON`,
  ];
}
const auth = z.object({ errors: z.array(z.object({ code: z.number(), message: z.string().optional() })).optional() });
export async function collectUsage(env: InfrastructureEnv, period: z.infer<typeof UsagePeriod>, fetcher: typeof fetch = fetch) {
  const empty = { period, fetched_at: new Date().toISOString(), daily: [], endpoints: [], countries: [], matrix: [] };
  const result = (status: "unconfigured" | "permission_denied" | "error", reason?: "unknown_table") => UsageSchema.parse({ ...empty, status, ...(reason ? { reason } : {}) });
  if (!env.CLOUDFLARE_READ_TOKEN?.trim() || env.CF_ACCOUNT_ID !== ACCOUNT_ID) return result("unconfigured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const schemas = [UsageDay, UsageEndpoint, UsageCountry, UsageCell];
    const results = await Promise.all(usageSQL(period).map(async (sql, i) => {
      try {
        const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${env.CLOUDFLARE_READ_TOKEN}`, "Content-Type": "text/plain" }, body: sql,
        });
        if ([401, 403].includes(response.status)) return result("permission_denied");
        const body: unknown = await readJSON(response, 256 * 1024);
        const errors = auth.safeParse(body);
        if (errors.success && errors.data.errors?.some(e => [10000, 9109, 10001, 9106, 9107, 9103].includes(e.code))) return result("permission_denied");
        if (!response.ok || (errors.success && errors.data.errors?.length)) {
          const unknownTable = errors.success && errors.data.errors?.some(e => /unknown table|table .*does not exist/i.test(e.message ?? ""));
          return result("error", unknownTable ? "unknown_table" : undefined);
        }
        // Bound the entire envelope before skipping malformed individual rows.
        const raw = z.object({ data: z.array(z.unknown()).max([500, 200, 300, 100][i]) }).parse(body).data;
        let skipped = 0;
        const rows = raw.flatMap(row => {
          const parsed = schemas[i].safeParse(row);
          if (!parsed.success) { skipped++; return []; }
          return [parsed.data];
        });
        // Count locally only: never log or return rejected upstream data.
        void skipped;
        return rows;
      } catch { return result("error"); }
    }));
    for (const r of results) if (!Array.isArray(r) && r.status === "permission_denied") return r;
    for (const r of results) if (!Array.isArray(r)) return r;
    const rows = results;
    return UsageSchema.parse({ ...empty, status: "ok", daily: rows[0], endpoints: rows[1], countries: rows[2], matrix: rows[3] });
  } catch { return result("error"); }
  finally { clearTimeout(timer); }
}
