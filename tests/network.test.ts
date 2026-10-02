import { it, expect, vi } from "vitest";
import { collectStatus, retryAt, readJSON } from "../src/network.ts";
import { UPSTREAM, ENDPOINTS } from "../src/contracts.ts";
import { handle } from "../src/worker.ts";
import { publicFetch, json, NOW, fx } from "./fixtures.ts";

it("固定5エンドポイントをGETし、404 no_observationのみ空観測とする", async () => {
  const fetcher = vi.fn(publicFetch());
  const r = await collectStatus(fetcher, { now: () => NOW });
  expect(r.endpoints.latest.state).toBe("empty");
  expect(r.endpoints.fx.state).toBe("empty");
  expect(fetcher.mock.calls).toHaveLength(5);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
    Object.values(ENDPOINTS).map((e) => UPSTREAM + e.path),
  );
  for (const [, init] of fetcher.mock.calls)
    expect(init).toMatchObject({
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
    });
});
it.each([302, 403, 404, 429, 500, 503])(
  "HTTP %sをno_observationと混同せず正常欄は保持",
  async (status) => {
    const r = await collectStatus(
      publicFetch({
        "/v1/latest": () =>
          json({ error: { code: "different" } }, status, {
            "retry-after": "180",
          }),
      }),
      { now: () => NOW },
    );
    expect(r.endpoints.latest.state).toBe("error");
    expect(r.endpoints.latest.http_status).toBe(status);
    expect(r.endpoints.health.state).toBe("ok");
    expect(r.endpoints.latest.retry_at).toBe(
      status === 429 ? new Date(NOW + 180000).toISOString() : null,
    );
  },
);
it.each([
  () =>
    new Response("<html>bad</html>", {
      headers: { "content-type": "text/html" },
    }),
  () =>
    new Response("{bad", { headers: { "content-type": "application/json" } }),
  () => json({ schema_version: "1", data: [{ source_id: "ecb" }] }),
  () =>
    new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": "999999999",
      },
    }),
])("不正JSON、HTML、schema破損・巨大応答はエラー", async (make) => {
  const r = await collectStatus(publicFetch({ "/v1/latest": make }));
  expect(r.endpoints.latest.state).toBe("error");
  expect(["format", "too_large"]).toContain(r.endpoints.latest.error_kind);
  expect(r.endpoints.latest.data).toBeNull();
  expect(r.endpoints.sources.state).toBe("ok");
});
it("タイムアウトと接続失敗を個別に報告", async () => {
  const normal = publicFetch();
  const fetcher = (async (input, init) => {
    if (String(input).endsWith("/health"))
      throw new Error("network unavailable");
    if (String(input).endsWith("/v1/latest"))
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      );
    return normal(input, init);
  }) as typeof fetch;
  const r = await collectStatus(fetcher, { timeoutMs: 10 });
  expect(r.endpoints.latest.error_kind).toBe("timeout");
  expect(r.endpoints.health.error_kind).toBe("network");
  expect(r.endpoints.sources.state).toBe("ok");
});
it("ボディ読み取りもサイズ制限対象", async () => {
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"x":"123456789"}'));
        c.close();
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
  await expect(readJSON(response, 5)).rejects.toThrow("too_large");
});
it("Retry-After秒・HTTP日時・未提供を扱う", () => {
  expect(retryAt("120", NOW)).toBe(new Date(NOW + 120000).toISOString());
  expect(retryAt(new Date(NOW + 300000).toUTCString(), NOW)).toBe(
    new Date(NOW + 300000).toISOString(),
  );
  expect(retryAt(null, NOW)).toBe(new Date(NOW + 60000).toISOString());
  expect(retryAt("garbage", NOW)).toBe(new Date(NOW + 60000).toISOString());
});
it.each([
  ["POST", "/api/status", 405],
  ["PUT", "/api/status", 405],
  ["DELETE", "/api/status", 405],
  ["HEAD", "/api/status", 405],
  ["GET", "/api/status?url=https://evil.test", 400],
  ["GET", "/api/status?path=/secret", 400],
  ["GET", "/api/status?sql=DELETE", 400],
  ["GET", "/api/health", 404],
  ["GET", "/api", 404],
])("任意URL転送・書込み拒否 %s %s", async (method, path, status) => {
  const fetcher = vi.fn(publicFetch()),
    assets = { fetch: vi.fn(async () => new Response("asset")) };
  const response = await handle(
    new Request("http://localhost" + path, { method: method as string }),
    { ASSETS: assets },
    fetcher,
  );
  expect(response.status).toBe(status);
  expect(fetcher).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("GET statusはno-store、部分障害も200の個別結果で返し秘密ヘッダを転送しない", async () => {
  const fetcher = vi.fn(
    publicFetch({
      "/v1/latest": () => json({ schema_version: "1", data: [fx()] }),
    }),
  );
  const response = await handle(
    new Request("http://localhost/api/status", {
      headers: { Authorization: "secret", Cookie: "private" },
    }),
    { ASSETS: { fetch: async () => new Response() } },
    fetcher,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    ((await response.json()) as any).endpoints.latest.data.data[0].source
      .source_id,
  ).toBe("ecb");
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain("secret");
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain("private");
});
