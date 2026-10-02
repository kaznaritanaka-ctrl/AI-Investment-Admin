import { it, expect, vi } from "vitest";
import { collectInfrastructure } from "../src/infrastructure.ts";
import { handle } from "../src/worker.ts";
import {
  InfrastructureSchema,
  infrastructureStale,
} from "../src/infrastructure-contract.ts";
import { ACCOUNT_ID } from "../src/infrastructure-targets.ts";
import {
  cloudflareFixture,
  infrastructureFixture,
  INFRA_ENV,
  VERSION,
} from "./infrastructure-fixtures.ts";
import { NOW, json, publicFetch } from "./fixtures.ts";
const options = { now: () => NOW };

it("token未設定・アカウント不一致は外部通信せずnull、既存statusは動く", async () => {
  const fetcher = vi.fn(cloudflareFixture());
  const missing = await collectInfrastructure({}, fetcher, options);
  expect(missing.configuration).toBe("token_not_configured");
  expect(missing.workers[0].metrics.requests).toBeNull();
  const accountOnly = await collectInfrastructure(
    { CF_ACCOUNT_ID: ACCOUNT_ID },
    fetcher,
    options,
  );
  expect(accountOnly.configuration).toBe("token_not_configured");
  expect(accountOnly.availability).toBe("unavailable");
  expect(accountOnly.r2.storage.payload_bytes).toBeNull();
  expect(
    (
      await collectInfrastructure(
        { ...INFRA_ENV, CF_ACCOUNT_ID: "0".repeat(32) },
        fetcher,
      )
    ).configuration,
  ).toBe("account_not_configured");
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (
      await handle(
        new Request("https://admin.ai-investment-research.net/api/status"),
        { ASSETS: { fetch: vi.fn() } },
        publicFetch(),
      )
    ).status,
  ).toBe(200);
});
it("固定read-only APIをserver Secretで取得し最小projectionだけ返す", async () => {
  const fetcher = vi.fn(cloudflareFixture());
  const r = await collectInfrastructure(INFRA_ENV, fetcher, options);
  expect(InfrastructureSchema.safeParse(r).success).toBe(true);
  expect(r.availability).toBe("ready");
  expect(r.workers[0].metrics).toMatchObject({
    requests: 23,
    errors: 0,
    cpu_ms_p99: 3.75,
  });
  expect(r.workers[0].deployment.versions).toEqual([
    { id: VERSION, percentage: 100 },
  ]);
  expect(r.d1[0].metadata.storage_bytes).toBe(1048576);
  expect(r.r2.storage.payload_bytes).toBe(262144);
  expect(r.workers[2].domains.hostnames).toEqual(["admin.fixture.test"]);
  expect(r.plan.value).toBe("unknown");
  expect(fetcher).toHaveBeenCalledTimes(23);
  for (const [url, init] of fetcher.mock.calls) {
    expect(String(url)).toMatch(
      /^https:\/\/api\.cloudflare\.com\/client\/v4\/(accounts\/[a-f0-9]{32}\/|graphql$)/,
    );
    expect(init).toMatchObject({
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer " + INFRA_ENV.CLOUDFLARE_READ_TOKEN,
    );
    if (init?.method === "POST") {
      expect(String(url)).toMatch(/\/graphql$/);
      expect(JSON.parse(String(init.body)).query).toMatch(/^query /);
      expect(String(init.body)).not.toContain("mutation");
    } else expect(init?.method).toBe("GET");
    expect(String(url)).not.toMatch(
      /\/query|\/raw|\/objects|\/secrets|\/content/,
    );
  }
  for (const secret of [
    INFRA_ENV.CLOUDFLARE_READ_TOKEN,
    "private-sentinel",
    ACCOUNT_ID,
    "unrelated.fixture.test",
  ])
    expect(JSON.stringify(r)).not.toContain(secret);
});
it("一部403でも正常項目を保持、上流エラー本文を返さない", async () => {
  const r = await collectInfrastructure(
    INFRA_ENV,
    cloudflareFixture((url) =>
      url.pathname.endsWith("/domains")
        ? json({ error: INFRA_ENV.CLOUDFLARE_READ_TOKEN }, 403)
        : undefined,
    ),
    options,
  );
  expect(r.availability).toBe("partial");
  expect(r.workers[0].domains).toMatchObject({
    state: "unavailable",
    reason: "permission_denied",
    hostnames: null,
  });
  expect(r.d1[0].metrics.rows_read).toBe(1500);
  expect(JSON.stringify(r)).not.toContain(INFRA_ENV.CLOUDFLARE_READ_TOKEN);
});
it("最小権限でCronとDomainが403でもmetadata・version・metricsを利用できる（synthetic）", async () => {
  const fetcher = vi.fn(
    cloudflareFixture((url) =>
      /\/(schedules|domains)$/.test(url.pathname)
        ? json({ error: "private-sentinel" }, 403)
        : undefined,
    ),
  );
  const r = await collectInfrastructure(INFRA_ENV, fetcher, options);
  expect(r.availability).toBe("partial");
  for (const worker of r.workers) {
    expect(worker.schedules).toMatchObject({
      state: "unavailable",
      reason: "permission_denied",
      crons: null,
    });
    expect(worker.domains).toMatchObject({
      state: "unavailable",
      reason: "permission_denied",
      hostnames: null,
    });
    expect(worker.metadata.state).toBe("ok");
    expect(worker.deployment.versions).toEqual([
      { id: VERSION, percentage: 100 },
    ]);
    expect(worker.exposure.workers_dev).toBe(false);
    expect(worker.metrics.requests).toBe(23);
  }
  expect(r.d1[0].metadata.state).toBe("ok");
  expect(r.r2.storage.state).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(23);
  expect(JSON.stringify(r)).not.toMatch(
    /private-sentinel|synthetic-server-secret/,
  );
});
it("429で再試行せずRetry-Afterを返し後続queueも抑止", async () => {
  const f = vi.fn(
    cloudflareFixture(() =>
      json({ secret: "private-sentinel" }, 429, { "retry-after": "420" }),
    ),
  );
  const r = await collectInfrastructure(INFRA_ENV, f, options);
  expect(r.workers[0].metadata.reason).toBe("rate_limited");
  expect(r.r2.storage.retry_at).toBe(new Date(NOW + 420000).toISOString());
  expect(f.mock.calls.length).toBeLessThanOrEqual(4);
});
it.each(["html", "shape", "large", "graphql_errors"])(
  "malformed / API errors %sを欠測とし0を作らない",
  async (kind) => {
    const r = await collectInfrastructure(
      INFRA_ENV,
      cloudflareFixture((url, init) => {
        if (
          !url.pathname.endsWith("/graphql") ||
          !String(init?.body).includes("AdminWorkerMetrics")
        )
          return;
        if (kind === "html")
          return new Response("<html>private-sentinel</html>");
        if (kind === "shape") return json({ data: { unexpected: 5 } });
        if (kind === "large")
          return json({}, 200, { "content-length": "9999999999" });
        return json({ data: null, errors: [{ message: "private-sentinel" }] });
      }),
      options,
    );
    expect(r.workers[0].metrics.state).toBe("unavailable");
    expect(r.workers[0].metrics.requests).toBeNull();
    expect(r.d1[0].metadata.state).toBe("ok");
    expect(JSON.stringify(r)).not.toContain("private-sentinel");
  },
);
it.each([null, []])(
  "null metrics/空seriesを0に変換しない (%s)",
  async (total) => {
    const r = await collectInfrastructure(
      INFRA_ENV,
      cloudflareFixture((url, init) => {
        if (
          url.pathname.endsWith("/graphql") &&
          String(init?.body).includes("AdminWorkerMetrics")
        )
          return json({
            data: {
              viewer: {
                accounts: [
                  {
                    total:
                      total === null
                        ? [
                            {
                              sum: { requests: null, errors: null },
                              quantiles: null,
                            },
                          ]
                        : [],
                    latest: [],
                  },
                ],
              },
            },
            errors: null,
          });
      }),
      options,
    );
    expect(r.workers[0].metrics.requests).toBeNull();
    expect(r.workers[0].metrics.cpu_ms_p99).toBeNull();
    expect(r.workers[0].metrics.state).toBe("unavailable");
  },
);
it("Worker/D1/R2が存在しない場合にmissingを表示し停止や空DBを推定しない", async () => {
  const r = await collectInfrastructure(
    INFRA_ENV,
    cloudflareFixture((url) =>
      url.pathname.endsWith("/script-settings") ||
      url.pathname.includes("/d1/") ||
      url.pathname.includes("/r2/")
        ? json({}, 404)
        : undefined,
    ),
    options,
  );
  expect(r.workers[0].metadata.state).toBe("missing");
  expect(r.d1[0].metadata).toMatchObject({
    state: "missing",
    storage_bytes: null,
  });
  expect(r.r2.metadata.state).toBe("missing");
  expect(r.workers[0].exposure.workers_dev).toBe(false);
});
it("古いR2 sampleと画面全体のstaleを区別、idle Workerを障害にしない", async () => {
  const r = await collectInfrastructure(
    INFRA_ENV,
    cloudflareFixture((url, init) => {
      if (
        url.pathname.endsWith("/graphql") &&
        String(init?.body).includes("AdminR2Storage")
      )
        return json({
          data: {
            viewer: {
              accounts: [
                {
                  total: [
                    {
                      max: {
                        payloadSize: 500,
                        metadataSize: 1,
                        objectCount: 2,
                      },
                      dimensions: {
                        datetime: new Date(NOW - 7 * 3600000).toISOString(),
                      },
                    },
                  ],
                },
              ],
            },
          },
          errors: null,
        });
    }),
    options,
  );
  expect(r.r2.storage).toMatchObject({
    state: "stale",
    reason: "old_sample",
    payload_bytes: 500,
  });
  expect(r.workers[0].metrics.state).toBe("ok");
  expect(infrastructureStale(r, NOW)).toBe(false);
  expect(infrastructureStale(r, NOW + 900001)).toBe(true);
});
it("全要求を4並列・共通deadlineで制限しTimeoutでも応答する", async () => {
  let running = 0,
    max = 0;
  const f = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        max = Math.max(max, ++running);
        init?.signal?.addEventListener("abort", () => {
          running--;
          reject(new Error("secret-sentinel"));
        });
      }),
  );
  const r = await collectInfrastructure(INFRA_ENV, f, {
    ...options,
    timeoutMs: 10,
  });
  expect(max).toBe(4);
  expect(f).toHaveBeenCalledTimes(4);
  expect(r.r2.storage.reason).toBe("timeout");
  expect(r.availability).toBe("unavailable");
});
it("Freeはmanual evidenceと日時が揃ったときのみ、API確認とは表示しない", async () => {
  const p = infrastructureFixture().plan;
  const r = await collectInfrastructure(
    {
      ...INFRA_ENV,
      WORKERS_PLAN: "free",
      WORKERS_PLAN_VERIFIED_AT: p.verified_at!,
      WORKERS_PLAN_EVIDENCE: p.evidence!,
    },
    cloudflareFixture(),
    options,
  );
  expect(r.plan.verification).toBe("manual_evidence");
  expect(r.plan.value).toBe("free");
  expect(
    (
      await collectInfrastructure(
        { ...INFRA_ENV, WORKERS_PLAN: "free" },
        cloudflareFixture(),
        options,
      )
    ).plan.value,
  ).toBe("unknown");
});
it.each([
  [
    "POST",
    "https://admin.ai-investment-research.net/api/infrastructure",
    {},
    405,
  ],
  [
    "GET",
    "https://admin.ai-investment-research.net/api/infrastructure?url=https://evil.test",
    {},
    400,
  ],
  ["GET", "https://bypass.workers.dev/api/infrastructure", {}, 403],
  [
    "GET",
    "https://admin.ai-investment-research.net/api/infrastructure",
    { origin: "https://evil.test" },
    403,
  ],
  [
    "GET",
    "https://admin.ai-investment-research.net/api/infrastructure",
    { "sec-fetch-site": "cross-site" },
    403,
  ],
])("Infrastructure境界 %s %s", async (method, url, headers, status) => {
  const f = vi.fn(cloudflareFixture());
  const response = await handle(
    new Request(url, { method, headers: headers as Record<string, string> }),
    { ...INFRA_ENV, ASSETS: { fetch: vi.fn() } },
    f,
  );
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect(f).not.toHaveBeenCalled();
});
it("Infrastructure HTTP projectionはCookie/tokenを反射しない", async () => {
  const r = await handle(
    new Request("https://admin.ai-investment-research.net/api/infrastructure", {
      headers: { Authorization: "browser-secret", Cookie: "browser-cookie" },
    }),
    { ...INFRA_ENV, ASSETS: { fetch: vi.fn() } },
    cloudflareFixture(),
  );
  expect(r.status).toBe(200);
  const body = await r.text();
  expect(body).not.toMatch(
    /browser-secret|browser-cookie|synthetic-server-secret-sentinel|private-sentinel/,
  );
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});
