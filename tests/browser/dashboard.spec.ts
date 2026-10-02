import { test, expect } from "@playwright/test";
import { report, fx, ai, NOW, failure, sourceMetadata } from "../fixtures.ts";
import { infrastructureFixture } from "../infrastructure-fixtures.ts";
test("初回予定のカウントダウンは予定時刻で止まり翌日へ移らない", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T18:15:59Z"));
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: report() }),
  );
  await page.goto("/");
  await page.getByTestId("initial-details").locator(":scope > summary").click();
  await expect(page.getByRole("timer")).toHaveText("00:01:01");
  await page.clock.setFixedTime(new Date("2026-09-29T18:17:00Z"));
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByTestId("initial-countdown")).toContainText(
    "予定時刻経過・公開結果を確認中",
  );
  await page.clock.setFixedTime(new Date("2026-09-30T18:17:00Z"));
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.locator(".initial-target")).toContainText(
    "2026/09/30 03:17:00 JST",
  );
});
test("価格条件・単位が複数でもinputを1件に潰さず追加区分も残す", async ({
  page,
}) => {
  const observation = ai();
  if (observation.dataset !== "ai_api_prices") throw new Error("fixture");
  observation.value.price_components = [
    {
      component_type: "input",
      amount_decimal: "1.0000000000000001",
      currency: "USD",
      unit: "million_tokens",
      tier_conditions: "synthetic tier A",
    },
    {
      component_type: "input",
      amount_decimal: "2.5000",
      currency: "USD",
      unit: "request",
      tier_conditions: "synthetic tier B",
    },
    {
      component_type: "output",
      amount_decimal: null,
      currency: "USD",
      unit: "million_tokens",
    },
    {
      component_type: "cache_read",
      amount_decimal: "0.000123",
      currency: "USD",
      unit: "token",
      cache_ttl: "synthetic 5m",
    },
  ];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: report([observation]) }),
  );
  await page.goto("/");
  const matrix = page.locator(".ai-table");
  await expect(matrix).toContainText("1.0000000000000001");
  await expect(matrix).toContainText("2.5000");
  await expect(matrix).toContainText("入力：USD / 100万トークンあたり");
  await expect(matrix).toContainText("入力：USD / 1リクエストあたり");
  await expect(
    matrix.getByRole("cell", { name: "未提供", exact: true }),
  ).toBeVisible();
  await page.getByText("全価格区分・条件", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "キャッシュ読込", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.000123", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".price-detail")).toContainText("synthetic tier A");
  await expect(page.locator(".price-detail")).toContainText("synthetic tier B");
  await expect(page.locator(".price-detail")).toContainText("synthetic 5m");
});
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) });
  await page.route("**/api/infrastructure", (route) =>
    route.fulfill({ json: infrastructureFixture(false) }),
  );
});
test("空状態・readonly・JSON・スマートフォンでも横崩れしない", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: report() }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview 収集状況" }),
  ).toBeVisible();
  await expect(page.getByText("実行報告未受信")).toBeVisible();
  await expect(
    page
      .getByTestId("initial-verdict")
      .getByText("対象2ソースの公開観測を確認", { exact: true }),
  ).toHaveCount(0);
  await page.getByTestId("health-details").locator(":scope > summary").click();
  await expect(page.getByText("外部監視未接続")).toBeVisible();
  await page.getByTestId("raw-details").locator(":scope > summary").click();
  await expect(page.getByText("/v1/latest — empty / HTTP 404")).toBeVisible();
  await page.screenshot({
    path: "work/screenshots/synthetic-empty-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/screenshots/synthetic-empty-mobile.png",
    fullPage: true,
  });
});
test("両ソース・decimal・null価格・更新による消失とエラー", async ({
  page,
}) => {
  let current = report([fx(), ai()]),
    count = 0;
  await page.route("**/api/status", (route) => {
    count++;
    return route.fulfill({ json: current });
  });
  await page.goto("/");
  await page.getByTestId("initial-details").locator(":scope > summary").click();
  await expect(
    page
      .getByTestId("initial-verdict")
      .getByText("対象2ソースの公開観測を確認", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.123456789012345678", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "未提供", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/screenshots/synthetic-observations.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: "自動更新" }).uncheck();
  current = report();
  await page.clock.fastForward(6000);
  await page.getByRole("button", { name: "今すぐ更新" }).click();
  await expect(
    page.getByRole("cell", { name: "0.123456789012345678", exact: true }),
  ).toHaveCount(0);
  current.endpoints.latest = failure("timeout");
  await page.clock.fastForward(6000);
  await page.getByRole("button", { name: "今すぐ更新" }).click();
  await expect(
    page.getByText("判定できない", { exact: true }).first(),
  ).toBeVisible();
  expect(count).toBe(3);
});
test("一部失敗でもFXと取得成功したhealthを表示", async ({ page }) => {
  const r = report([fx()]);
  r.endpoints.sources = failure();
  await page.route("**/api/status", (route) => route.fulfill({ json: r }));
  await page.goto("/");
  await page.getByTestId("initial-details").locator(":scope > summary").click();
  await expect(
    page
      .getByTestId("initial-verdict")
      .getByText("一部確認済み", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("一部取得失敗", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell").filter({ hasText: "1.234567890123456789" }),
  ).toBeVisible();
});
test("Worker自体もGET以外・任意URL・未知のAPIを拒否する", async ({
  request,
}) => {
  // Rejected locally before upstream fetch. No real API traffic.
  for (const path of [
    "/api/status?url=https://example.com",
    "/api/status?sql=SELECT",
  ]) {
    const r = await request.get(path);
    expect(r.status()).toBe(400);
  }
  expect((await request.post("/api/status")).status()).toBe(405);
  expect((await request.get("/api/unknown")).status()).toBe(404);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  for (const filled of [false, true]) {
    test(`wide ${viewport.width}x${viewport.height} / ${filled ? "observations" : "empty"}: 主要情報を1画面に収める`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const eurUsd = fx(),
        eurJpy = fx(),
        cross = fx(),
        large = ai(),
        small = ai();
      if (eurJpy.dataset === "fx") {
        eurJpy.observation_id = "synthetic-eur-jpy";
        eurJpy.entity_key = "EUR/JPY";
        eurJpy.value.quote_currency = "JPY";
        eurJpy.value.rate_decimal = "170.1234";
      }
      if (cross.dataset === "fx") {
        cross.observation_id = "synthetic-cross";
        cross.entity_key = "USD/JPY";
        cross.value.base_currency = "USD";
        cross.value.quote_currency = "JPY";
        cross.value.rate_decimal = "145.23456789";
        cross.value.reference_rate_type = "project_calculation";
      }
      if (large.dataset === "ai_api_prices") {
        large.value.model_id = "synthetic-large-latest";
      }
      if (small.dataset === "ai_api_prices") {
        small.observation_id = "synthetic-small";
        small.value.model_id = "synthetic-small-latest";
      }
      const r = report(filled ? [eurUsd, eurJpy, cross, large, small] : []);
      if (filled)
        r.endpoints.health.data!.collector = {
          last_collector_completed_at: r.fetched_at,
          collection_enabled: 1,
          monitor_connected: 0,
        };
      await page.route("**/api/status", (route) => route.fulfill({ json: r }));
      await page.goto("/");
      await expect(page.getByText("取得成功", { exact: true })).toBeVisible();
      for (const name of ["Runs", "Data", "Releases", "Rights", "Settings"])
        await expect(
          page.getByRole("button", { name: new RegExp("^" + name + " ") }),
        ).toBeDisabled();
      for (const id of ["health-details", "raw-details", "diagnostics"])
        await expect(page.getByTestId(id)).not.toHaveAttribute("open");
      await page.screenshot({
        path: `work/screenshots/wide-${viewport.width}-${filled ? "observations" : "empty"}.png`,
        fullPage: true,
      });
      const side = await page
        .getByRole("complementary", { name: "管理メニュー" })
        .boundingBox();
      expect(side!.width).toBeGreaterThanOrEqual(200);
      expect(side!.width).toBeLessThanOrEqual(240);
      const main = await page.getByRole("main").boundingBox();
      expect(main!.width).toBeGreaterThan(viewport.width - 250);
      await expect(page.locator(".sources-panel")).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".fx-panel")).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".ai-panel")).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(viewport.height);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
    });
  }
}

test("Sources・Infrastructureが動作し将来ページはdisabled、token未設定でもOverview維持", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: report([fx(), ai()]) }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Cloudflare metrics unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sources 公開ソース" }),
  ).toBeVisible();
  await expect(page.locator(".source-inventory")).toContainText(
    "有効・無効：未取得",
  );
  await expect(page.locator(".source-inventory")).toContainText(
    "2026/09/30 03:18:00 JST",
  );
  await page
    .getByRole("button", { name: "Infrastructure", exact: true })
    .click();
  await expect(
    page.getByText("Cloudflare metrics unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workers-table")).toContainText("未取得");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".ai-table")).toContainText("0.123456789012345678");
});

for (const width of [1440, 1920]) {
  test(`cockpit synthetic ${width}: metadata・null・partial・staleを表示`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 });
    const r = infrastructureFixture();
    r.workers[1].metrics.errors = null;
    r.workers[1].metrics.state = "unavailable";
    r.workers[1].metrics.reason = "permission_denied";
    r.availability = "partial";
    const publicReport = report([fx(), ai()]);
    publicReport.endpoints.sources.data!.data = [
      sourceMetadata("ecb"),
      sourceMetadata("models_dev"),
    ];
    await page.route("**/api/infrastructure", (route) =>
      route.fulfill({ json: r }),
    );
    await page.route("**/api/status", (route) =>
      route.fulfill({ json: publicReport }),
    );
    await page.goto("/");
    await expect(page.locator(".cockpit-stats .stat")).toHaveCount(8);
    await page.screenshot({
      path: `work/screenshots/cockpit-overview-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(width === 1440 ? 900 : 1080);
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.screenshot({
      path: `work/screenshots/cockpit-sources-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Infrastructure", exact: true })
      .click();
    await expect(page.locator(".workers-table")).toContainText("23 / 未取得");
    await expect(page.locator(".workers-table")).toContainText(
      "Unknown · 権限不足",
    );
    await page.screenshot({
      path: `work/screenshots/cockpit-infrastructure-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("checkbox", { name: "自動更新" }).uncheck();
    await page.clock.fastForward(900001);
    await expect(
      page.getByText("Stale（15分超前）", { exact: false }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.content()).not.toContain(
      "synthetic-server-secret-sentinel",
    );
  });
}
