import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { adminProxy } from "../src/admin-proxy.ts";
import { HighresoPage, parseHighreso } from "../src/Highreso.tsx";
import { HighresoLimit } from "../src/admin-highreso-contract.ts";
import { highresoFixture } from "./highreso-fixtures.ts";
import { handle } from "../src/worker.ts";
const url = new URL("https://admin.ai-investment-research.net/api/highreso");
function binding() {
  const data = highresoFixture();
  return {
    read: vi.fn(),
    highresoRuns: vi.fn(async () => data.runs),
    highresoLatestPrices: vi.fn(async () => data.prices),
  };
}
it("validates both RPC responses and uses the bounded runs limit", async () => {
  const service = binding();
  const response = await adminProxy(url, service);
  expect(response.status).toBe(200);
  expect(parseHighreso(await response.json())).toEqual(highresoFixture());
  expect(service.highresoRuns).toHaveBeenCalledWith(30);
  expect(service.read).not.toHaveBeenCalled();
  for (const invalid of ["30", 0, 31, 1.5, null])
    expect(HighresoLimit.safeParse(invalid).success).toBe(false);
});
it("fails closed for either invalid or rejected RPC and missing methods", async () => {
  for (const method of ["highresoRuns", "highresoLatestPrices"] as const) {
    for (const value of [
      null,
      {
        ...highresoFixture()[method === "highresoRuns" ? "runs" : "prices"],
        visibility: "public",
      },
    ]) {
      const service = { ...binding(), [method]: async () => value };
      expect((await adminProxy(url, service)).status).toBe(503);
    }
    const service = {
      ...binding(),
      [method]: async () => {
        throw new Error("SECRET upstream details");
      },
    };
    const response = await adminProxy(url, service);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET");
  }
  expect((await adminProxy(url)).status).toBe(503);
  expect((await adminProxy(url, { read: vi.fn() })).status).toBe(503);
});
it("rejects query injection, cross-site requests and writes before invoking RPC", async () => {
  const service = binding();
  expect((await adminProxy(new URL(url + "?limit=31"), service)).status).toBe(
    400,
  );
  const env = { ASSETS: { fetch: vi.fn() }, ADMIN_READ: service };
  for (const request of [
    new Request(url, { method: "POST" }),
    new Request(url, { headers: { origin: "https://evil.test" } }),
  ])
    expect((await handle(request, env)).status).toBeGreaterThanOrEqual(400);
  expect(service.highresoRuns).not.toHaveBeenCalled();
  expect(
    (await handle(new Request(url), env)).headers.get("cache-control"),
  ).toBe("no-store");
});
it("preserves quote identity, decimals, nulls, attribution and bounded UTC history", () => {
  const html = renderToStaticMarkup(<HighresoPage data={highresoFixture()} />);
  for (const value of [
    "123.45000000000001",
    "無料ではありません",
    "node_hour",
    "month",
    "保存済み観測数",
    "48",
    "一部完了",
    "timeout",
    "合成テスト出典",
    "https://example.test/terms",
    "直近30回",
    "条件の変更",
    "UTC",
    "未確認",
  ])
    expect(html).toContain(value);
  expect(html.match(/Synthetic GPU/g)).toHaveLength(2);
  const empty = highresoFixture();
  empty.runs.runs = [];
  empty.prices.prices = [];
  empty.prices.run_id = null;
  empty.prices.observed_at = null;
  expect(renderToStaticMarkup(<HighresoPage data={empty} />)).toContain(
    "閲覧可能な価格はありません",
  );
  expect(renderToStaticMarkup(<HighresoPage data={null} />)).toContain(
    "現在取得できません",
  );
});
it.each([false, true])("accepts prices with identity fields present=%s through proxy and client", async (changed) => {
  const data = highresoFixture();
  if (changed) Object.assign(data.prices.prices[0], {
    instance_id: "synthetic-new",
    instance_id_changed_from: "synthetic-old",
    identity_change_label: "型番変更",
  });
  const service = { ...binding(), highresoLatestPrices: async () => data.prices };
  const response = await adminProxy(url, service);
  expect(response.status).toBe(200);
  expect(parseHighreso(await response.json())).toEqual(data);
});
it("keeps price entries strict and validates identity field types", async () => {
  for (const extra of [
    { unknown_key: "rejected" },
    { instance_id: 123 },
    { instance_id_changed_from: 123 },
    { identity_change_label: "別のラベル" },
  ]) {
    const data = highresoFixture();
    Object.assign(data.prices.prices[0], extra);
    expect(() => parseHighreso(data)).toThrow();
    expect((await adminProxy(url, {
      ...binding(), highresoLatestPrices: async () => data.prices,
    })).status).toBe(503);
  }
});
it("accepts nullable identity fields from the API contract", () => {
  const data = highresoFixture();
  Object.assign(data.prices.prices[0], {
    instance_id: null, instance_id_changed_from: null, identity_change_label: null,
  });
  expect(parseHighreso(data)).toEqual(data);
});
it("shows identity changes only on labeled rows and escapes the previous model", () => {
  const data = highresoFixture();
  expect(renderToStaticMarkup(<HighresoPage data={data} />)).not.toContain("型番変更（旧:");
  Object.assign(data.prices.prices[0], {
    instance_id: "synthetic-new",
    instance_id_changed_from: '<img src=x onerror="alert(1)">',
    identity_change_label: "型番変更",
  });
  const html = renderToStaticMarkup(<HighresoPage data={parseHighreso(data)} />);
  expect(html).toContain("型番変更（旧: &lt;img src=x onerror=&quot;alert(1)&quot;&gt;）");
  expect(html).not.toContain("<img");
  expect(html.match(/型番変更（旧:/g)).toHaveLength(1);
});
