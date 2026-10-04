import { collectStatus } from "./network.ts";
import { collectInfrastructure } from "./infrastructure.ts";
import type { InfrastructureEnv } from "./infrastructure.ts";
import { adminProxy } from "./admin-proxy.ts";
import type { AdminReadService } from "./admin-proxy.ts";
type Env = InfrastructureEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ADMIN_READ?: AdminReadService;
};
const json = (body: unknown, status = 200, more: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      ...more,
    },
  });
export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET")
    return json({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  if (url.pathname.startsWith("/api/") && !["/api/status", "/api/infrastructure"].includes(url.pathname)) {
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const origin = request.headers.get("origin");
    if ((!local && url.hostname !== "admin.ai-investment-research.net") ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin !== null && origin !== url.origin))
      return json({ error: "forbidden" }, 403);
    const response = await adminProxy(url, env.ADMIN_READ);
    const result = json(await response.json(), response.status);
    return result;
  }
  if (url.search !== "") return json({ error: "query_not_allowed" }, 400);
  if (url.pathname === "/api/infrastructure") {
    // Access protects production. These checks additionally reject cross-site browser
    // requests and alternate hostnames; they are not a substitute for authentication.
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const origin = request.headers.get("origin");
    if (
      (!local && url.hostname !== "admin.ai-investment-research.net") ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin !== null && origin !== url.origin)
    )
      return json({ error: "forbidden" }, 403);
    const report = await collectInfrastructure(env, fetcher);
    const checks = [
      ...report.workers.flatMap((w) => [
        w.metadata,
        w.metrics,
        w.schedules,
        w.domains,
        w.exposure,
        w.deployment,
      ]),
      ...report.d1.flatMap((d) => [d.metadata, d.metrics]),
      report.r2.metadata,
      report.r2.storage,
      report.r2.operations,
    ];
    const retry = Math.max(
      0,
      ...checks.map((c) =>
        c.retry_at ? Date.parse(c.retry_at) - Date.now() : 0,
      ),
    );
    return json(
      report,
      200,
      retry > 0 ? { "Retry-After": String(Math.ceil(retry / 1000)) } : {},
    );
  }
  if (url.pathname === "/api/status") {
    const report = await collectStatus(fetcher);
    const retry = Math.max(
      0,
      ...Object.values(report.endpoints).map((r) =>
        r.retry_at ? Date.parse(r.retry_at) - Date.now() : 0,
      ),
    );
    return json(
      report,
      200,
      retry > 0 ? { "Retry-After": String(Math.ceil(retry / 1000)) } : {},
    );
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
    return json({ error: "not_found" }, 404);
  return env.ASSETS.fetch(request);
}
export default { fetch: (request: Request, env: Env) => handle(request, env) };
