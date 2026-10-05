import { AdminQuery, AdminReport, AdminResource } from "./admin-contract.ts";
import type { Query, Resource } from "./admin-contract.ts";
export interface AdminReadService {
  read(resource: Resource, query: Query): Promise<unknown>;
}
export async function adminProxy(
  url: URL,
  binding?: AdminReadService,
): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = AdminResource.safeParse(parts[1]);
  if (!resource.success || parts.length > 3)
    return Response.json({ error: "not_found" }, { status: 404 });
  const input: Record<string, string> = {};
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1)
      return Response.json({ error: "invalid_query" }, { status: 400 });
    input[key] = url.searchParams.get(key)!;
  }
  if (parts[2]) {
    if (!["runs", "data"].includes(resource.data) || input.id)
      return Response.json({ error: "invalid_query" }, { status: 400 });
    input.id = parts[2];
  }
  const query = AdminQuery.safeParse(input);
  if (!query.success)
    return Response.json({ error: "invalid_query" }, { status: 400 });
  const cutoff = Math.min(
    Date.now(),
    Date.parse(query.data.as_of ?? new Date().toISOString()),
  );
  const to = Math.min(
    cutoff,
    Date.parse(query.data.to ?? new Date(cutoff).toISOString()),
  );
  const from = query.data.from
    ? Date.parse(query.data.from)
    : to - 7 * 86400000;
  if (
    from > to ||
    to - from > 31 * 86400000 ||
    (query.data.as_of && Date.parse(query.data.as_of) > Date.now())
  )
    return Response.json({ error: "invalid_query" }, { status: 400 });
  const unavailable = (issue: string) =>
    Response.json({
      schema_version: "admin-read-v1",
      resource: resource.data,
      fetched_at: new Date().toISOString(),
      as_of: new Date().toISOString(),
      state: "unavailable",
      issues: [issue],
      next_cursor: null,
    });
  if (!binding) return unavailable("admin_read_binding_not_configured");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      binding.read(resource.data, query.data),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("deadline")), 10000);
      }),
    ]);
    const report = AdminReport.parse(raw);
    if (report.resource !== resource.data) throw new Error("invalid_resource");
    const body = JSON.stringify(report);
    if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024)
      throw new Error("response_too_large");
    return new Response(body, {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return unavailable("admin_read_unavailable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
