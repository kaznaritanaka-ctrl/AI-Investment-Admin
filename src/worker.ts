import { collectStatus } from "./network.ts";
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };
const json = (body: unknown, status = 200, more: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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
  if (url.search !== "") return json({ error: "query_not_allowed" }, 400);
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
