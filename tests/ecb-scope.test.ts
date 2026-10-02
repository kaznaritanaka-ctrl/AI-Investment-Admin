import { it, expect } from "vitest";
import { collectStatus } from "../src/network.ts";
import { sourceRows } from "../src/operations-model.ts";
import { observations, publicDataLabel, sourceChecks, jst } from "../src/view-model.ts";
import { catalogReport, report, fx, ai, publicFetch, json, ok, failure, NOW, STAMP } from "./fixtures.ts";

it("モデル100件がlatestを埋めてもECB3件・状態・JST時刻を独立取得する", async () => {
  const fixture = catalogReport();
  const r = await collectStatus(publicFetch({
    "/v1/latest": () => json(fixture.endpoints.latest.data),
    "/v1/latest?dataset=fx": () => json(fixture.endpoints.fx.data),
  }), { now: () => NOW });
  expect(r.endpoints.latest.data!.data).toHaveLength(100);
  expect(r.endpoints.fx.data!.data).toHaveLength(3);
  expect(observations(r)).toHaveLength(103);
  expect(sourceRows(r, NOW)[0]).toMatchObject({
    id: "ecb", count: 3, freshness: "Healthy", latest: STAMP,
  });
  expect(sourceRows(r, NOW)[1]).toMatchObject({ count: 100, freshness: "Healthy" });
  expect(jst(sourceRows(r, NOW)[0].latest)).toBe("2026/09/30 03:18:00 JST");
  expect(r.endpoints.fx.data!.data[0].value.rate_decimal).toBe("1.234567890123456789");
});

it("両応答に同じFXがあっても重複せず専用応答を採用する", () => {
  const r = report([fx("2026-09-28T18:18:00Z"), ai()], [fx()]);
  expect(observations(r)).toHaveLength(2);
  expect(sourceRows(r, NOW)[0]).toMatchObject({ count: 1, latest: STAMP, freshness: "Healthy" });
});

it.each(["latest", "fx"] as const)("%sの取得失敗だけをUnknownにし正常な別ソースを保持する", (endpoint) => {
  const r = report([fx(), ai()]);
  r.endpoints[endpoint] = failure("timeout");
  const rows = sourceRows(r, NOW);
  const failed = endpoint === "fx" ? 0 : 1;
  expect(rows[failed]).toMatchObject({ count: null, latest: null, freshness: "Unknown" });
  expect(rows[1 - failed]).toMatchObject({ count: 1, latest: STAMP, freshness: "Healthy" });
  expect(sourceChecks(r)[failed].label).toBe("取得エラー");
  expect(publicDataLabel(r)).toBe("あり");
});

it.each([404, 200])("FXの正常な空応答HTTP %sは古い非絞込FXへフォールバックしない", async (status) => {
  const r = await collectStatus(publicFetch({
    "/v1/latest": () => json({ schema_version: "1", data: [fx(), ai()] }),
    "/v1/latest?dataset=fx": () => status === 404
      ? json({ error: { code: "no_observation" } }, 404)
      : json({ schema_version: "1", data: [] }),
  }));
  expect(r.endpoints.fx.state).toBe(status === 404 ? "empty" : "ok");
  expect(sourceRows(r, NOW)[0]).toMatchObject({ count: 0, latest: null, freshness: "Unknown" });
  expect(observations(r).map((o) => o.dataset)).toEqual(["ai_api_prices"]);
});

it.each([403, 404, 429])("FXのHTTP %sを空と誤認せず、429待機時刻を保持する", async (status) => {
  const r = await collectStatus(publicFetch({
    "/v1/latest": () => json({ schema_version: "1", data: [ai()] }),
    "/v1/latest?dataset=fx": () => json({ error: { code: "other_error" } }, status, { "retry-after": "180" }),
  }), { now: () => NOW });
  expect(r.endpoints.fx).toMatchObject({ state: "error", error_kind: "http", data: null });
  expect(r.endpoints.fx.retry_at).toBe(status === 429 ? new Date(NOW + 180000).toISOString() : null);
  expect(sourceRows(r, NOW)[0].count).toBeNull();
  expect(sourceRows(r, NOW)[1].freshness).toBe("Healthy");
});

it("FX専用応答の別datasetを拒否しModels.devの正常結果を維持する", async () => {
  const r = await collectStatus(publicFetch({
    "/v1/latest": () => json({ schema_version: "1", data: [ai()] }),
    "/v1/latest?dataset=fx": () => json({ schema_version: "1", data: [ai()] }),
  }));
  expect(r.endpoints.fx).toMatchObject({ state: "error", error_kind: "format", data: null });
  expect(sourceRows(r, NOW).map((s) => s.freshness)).toEqual(["Unknown", "Healthy"]);
});

it("FX専用取得がタイムアウトしても他の結果は保持する", async () => {
  const normal = publicFetch({ "/v1/latest": () => json({ schema_version: "1", data: [ai()] }) });
  const fetcher = (async (input, init) => {
    if (String(input).endsWith("?dataset=fx"))
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    return normal(input, init);
  }) as typeof fetch;
  const r = await collectStatus(fetcher, { timeoutMs: 10 });
  expect(r.endpoints.fx.error_kind).toBe("timeout");
  expect(sourceRows(r, NOW).map((s) => s.freshness)).toEqual(["Unknown", "Healthy"]);
});

it("FXが取得エラーなら公開なしとは断定しない", () => {
  const r = report();
  r.endpoints.latest = ok({ schema_version: "1", data: [] });
  r.endpoints.fx = failure();
  expect(publicDataLabel(r)).toBe("現在確認できない");
});
