import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { collectUsage, usageSQL } from "../src/usage.ts";
import { UsageSchema } from "../src/contracts.ts";
import { ACCOUNT_ID } from "../src/infrastructure-targets.ts";
import { handle } from "../src/worker.ts";
import { UsagePage } from "../src/ConsolePages.tsx";
import { usageFixture } from "./usage-fixtures.ts";
const env = { CF_ACCOUNT_ID: ACCOUNT_ID, CLOUDFLARE_READ_TOKEN: "synthetic-server-secret-sentinel", ASSETS: { fetch: vi.fn() } };
function upstream() {
  const fixture = usageFixture();
  const data = [fixture.daily, fixture.endpoints, fixture.countries, fixture.matrix];
  let i = 0;
  return vi.fn<typeof fetch>(async () => Response.json({ data: data[i++] }));
}
afterEach(() => vi.unstubAllGlobals());
describe("usage projections", () => {
  it("uses four fixed bounded templates and rejects injection", () => {
    for (const p of ["7d", "30d", "90d"]) {
      const sql = usageSQL(p);
      expect(sql).toHaveLength(4);
      sql.forEach(q => { expect(q).toContain("SUM(_sample_interval * double1)"); expect(q).toContain("FROM api_usage_v1"); expect(q).toContain(`INTERVAL '${p.slice(0,-1)}' DAY`); });
      expect(sql[0]).toContain("GROUP BY day, statusClass");
      expect(sql[1]).toContain("blob3 = '429'"); expect(sql[1]).toContain("blob3 = '5xx'");
      expect(sql[3]).toContain("LIMIT 100");
    }
    for (const p of ["1d", "30d' DROP", "", null]) expect(() => usageSQL(p)).toThrow();
  });
  it("does not fetch with missing credentials or a different account", async () => {
    const fetcher = upstream();
    for (const config of [{}, { ...env, CF_ACCOUNT_ID: "other" }, { ...env, CLOUDFLARE_READ_TOKEN: " " }]) expect((await collectUsage(config, "30d", fetcher)).status).toBe("unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("projects validated rows and strips extra upstream fields", async () => {
    const f = upstream(); const r = await collectUsage(env, "30d", f);
    expect(r.status).toBe("ok"); expect(r.daily).toEqual(usageFixture().daily);
    expect(f).toHaveBeenCalledTimes(4);
    expect(f.mock.calls[0][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`);
    expect(f.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.stringify(r)).not.toContain(env.CLOUDFLARE_READ_TOKEN);
    expect(UsageSchema.parse({ ...r, token: "private-sentinel" })).not.toHaveProperty("token");
  });
  it.each([401, 403, 10000, 9109, 9106, 9107, 9103])("maps authentication failure %s safely", async code => {
    const f = vi.fn<typeof fetch>(async () => code < 1000 ? new Response("private-sentinel", { status: code }) : Response.json({ errors: [{ code, message: "private-sentinel" }] }));
    const r = await collectUsage(env, "7d", f);
    expect(r.status).toBe("permission_denied"); expect(f).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(r)).not.toContain("private-sentinel");
  });
  it("maps the verified HTTP 400 invalid-token envelope to permission_denied", async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json({ success: false, errors: [{ code: 9106, message: "Authentication failed (status: 400)" }] }, { status: 400 }));
    expect((await collectUsage(env, "30d", f)).status).toBe("permission_denied");
  });
  it("identifies unknown tables without exposing the upstream message", async () => {
    const r = await collectUsage(env, "30d", vi.fn(async () => Response.json({ errors: [{ code: 1, message: "Unknown table private-sentinel" }] }, { status: 400 })));
    expect(r).toMatchObject({ status: "error", reason: "unknown_table" });
    expect(JSON.stringify(r)).not.toContain("private-sentinel");
  });
  it("starts all four queries before waiting and accepts the verified FORMAT JSON envelope", async () => {
    const pending: ((r: Response) => void)[] = [];
    const f = vi.fn<typeof fetch>(() => new Promise(resolve => pending.push(resolve)));
    const report = collectUsage(env, "30d", f);
    expect(f).toHaveBeenCalledTimes(4);
    const fixture = usageFixture();
    [fixture.daily, fixture.endpoints, fixture.countries, fixture.matrix].forEach((data, i) => pending[i](Response.json({ meta: [], data, rows: data.length })));
    expect((await report).status).toBe("ok");
  });
  it("preserves good rows when malformed rows are mixed in", async () => {
    const f = upstream();
    f.mockImplementationOnce(async () => Response.json({ data: [...usageFixture().daily, { statusClass: "", calls: 1 }] }));
    expect((await collectUsage(env, "30d", f)).daily).toEqual(usageFixture().daily);
  });
  it.each([{ country: "USA", calls: 1 }, { country: "JP", calls: null }, { country: "JP", calls: -1 }])("skips invalid country/count %j", async bad => {
    const f = upstream(); f.mockImplementationOnce(async () => Response.json({ data: [] })).mockImplementationOnce(async () => Response.json({ data: [] })).mockImplementationOnce(async () => Response.json({ data: [bad] }));
    const report = await collectUsage(env, "30d", f);
    expect(report.status).toBe("ok"); expect(report.countries).toEqual([]);
  });
  it("skips unsafe routes and invalid status classes", async () => {
    for (const bad of [{ route: "/v1/a?secret=x" }, { route: "/" + "x".repeat(161) }]) {
      const f = upstream(); f.mockImplementationOnce(async () => Response.json({ data: [] })).mockImplementationOnce(async () => Response.json({ data: [{ ...usageFixture().endpoints[0], ...bad }] }));
      expect((await collectUsage(env, "30d", f)).status).toBe("ok");
    }
    const f = upstream(); f.mockImplementationOnce(async () => Response.json({ data: [{ day: "2026-10-22", statusClass: "200", calls: 1 }] }));
    expect((await collectUsage(env, "30d", f)).status).toBe("ok");
  });
  it("keeps empty data distinct from errors", async () => {
    expect((await collectUsage(env, "30d", vi.fn(async () => Response.json({ data: [] })))).status).toBe("ok");
    expect((await collectUsage(env, "30d", vi.fn(async () => { throw new Error("private-sentinel"); }))).status).toBe("error");
  });
});
describe("usage route", () => {
  it("protects requests before querying or reading cache", async () => {
    const f = upstream(), match = vi.fn(); vi.stubGlobal("caches", { default: { match } });
    for (const [url, init, status] of [
      ["https://evil.example/api/usage", {}, 403],
      ["https://admin.ai-investment-research.net/api/usage", { headers: { origin: "https://evil.example" } }, 403],
      ["https://admin.ai-investment-research.net/api/usage", { headers: { "sec-fetch-site": "cross-site" } }, 403],
      ["http://localhost/api/usage", { method: "POST" }, 405],
      ["http://localhost/api/usage?period=1d", {}, 400],
      ["http://localhost/api/usage?period=7d&period=30d", {}, 400],
      ["http://localhost/api/usage?sql=SELECT", {}, 400],
    ] as const) expect((await handle(new Request(url, init), env, f)).status).toBe(status);
    expect(f).not.toHaveBeenCalled(); expect(match).not.toHaveBeenCalled();
  });
  it("caches success for 300s and permission failures for 60s under separate period keys", async () => {
    const saved = new Map<string, Response>();
    const match = vi.fn(async (r: Request) => saved.get(r.url)?.clone());
    const put = vi.fn(async (r: Request, response: Response) => { expect(response.headers.get("cache-control")).toBe(r.url.endsWith("/30d") ? "max-age=300" : "max-age=60"); saved.set(r.url, response); });
    vi.stubGlobal("caches", { default: { match, put } });
    const f = upstream(), request = new Request("http://localhost/api/usage?period=30d");
    expect((await handle(request, env, f)).headers.get("cache-control")).toBe("no-store");
    await handle(request, env, f); expect(f).toHaveBeenCalledTimes(4); expect(put).toHaveBeenCalledTimes(1);
    expect([...saved.keys()][0]).toContain("/__internal/usage-v1/30d");
    await handle(new Request("http://localhost/api/usage?period=7d"), env, vi.fn(async () => new Response("denied", { status: 403 })));
    expect(put).toHaveBeenCalledTimes(2);
    await handle(new Request("http://localhost/api/usage?period=7d"), env, f);
    expect(f).toHaveBeenCalledTimes(4);
    const failing = vi.fn<typeof fetch>(async () => new Response("private-sentinel", { status: 500 }));
    const errorRequest = new Request("http://localhost/api/usage?period=90d");
    expect((await (await handle(errorRequest, env, failing)).json()).status).toBe("error");
    expect(saved.get("https://admin.ai-investment-research.net/__internal/usage-v1/90d")?.headers.get("cache-control")).toBe("max-age=60");
    await handle(errorRequest, env, failing);
    expect(failing).toHaveBeenCalledTimes(4);
    const r = await handle(request, { ...env, CLOUDFLARE_READ_TOKEN: undefined }, f);
    expect((await r.json()).status).toBe("unconfigured");
  });
});
it("renders Japanese states, KPIs and missing matrix cells without false zeros", () => {
  const render = (report: ReturnType<typeof usageFixture> | null) => renderToStaticMarkup(<UsagePage report={report} period="30d" error={null} />);
  expect(render({ ...usageFixture(), status: "permission_denied" })).toContain("Cloudflareの鍵に利用状況を読む権限（Account Analytics: Read）がありません");
  const html = render(usageFixture()); expect(html).toContain("5.00%"); expect(html).toContain("自分たちの確認作業も含まれます"); expect(html).toContain("日本");
  expect(render({ ...usageFixture(), daily: [], endpoints: [], countries: [], matrix: [] })).toContain("この期間の利用記録はありません");
});
