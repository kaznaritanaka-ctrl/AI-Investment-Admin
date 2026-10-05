import { test, expect } from "@playwright/test";
import { operational, sourceDTO, READ_AT } from "../admin-fixtures.ts";
import { AdminResource } from "../../src/admin-contract.ts";
import { infrastructureFixture } from "../infrastructure-fixtures.ts";
import { report, fx, ai, NOW } from "../fixtures.ts";
test.beforeEach(async ({ page, context }) => {
  await context.route("https://**", (route) => route.abort());
  await page.clock.install({ time: new Date(NOW) });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split("/")[2];
    if (name === "infrastructure")
      return route.fulfill({ json: infrastructureFixture() });
    if (name === "status") return route.fulfill({ json: report([fx(), ai()]) });
    const resource = AdminResource.safeParse(name);
    return resource.success
      ? route.fulfill({ json: operational(resource.data, url.searchParams) })
      : route.fulfill({ status: 404, json: { error: "not_found" } });
  });
});
test("Overview is three sections with four cards and no price or diagnostic requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.locator("[data-testid=overview-summary] .stat"),
  ).toHaveCount(4);
  await expect(page.locator(".source-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".source-table")).toContainText("ECB");
  await expect(page.locator(".source-table")).toContainText("Models.dev");
  await expect(page.locator(".source-table")).toContainText(
    "2026/09/30 03:18:00 JST",
  );
  await expect(
    page.getByRole("heading", { name: "要確認事項", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "初回確認・旧判定" }),
  ).toHaveCount(0);
  expect(requests.some((x) => /\/api\/(data|status|runs)/.test(x))).toBe(false);
  await page.screenshot({
    path: "work/screenshots/synthetic-overview-v2.png",
    fullPage: true,
  });
});
test("bounded summaries link to all sources and all attention items", async ({
  page,
}) => {
  const r = operational("overview");
  r.overview!.sources = Array.from({ length: 9 }, (_, i) =>
    sourceDTO("source_" + i),
  );
  r.overview!.attention = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    severity: "warning",
    message: "Synthetic issue " + i,
    page: "runs",
    source: "source_" + i,
    run: null,
  }));
  await page.route("**/api/overview", (route) => route.fulfill({ json: r }));
  await page.goto("/");
  await expect(page.locator(".source-table tbody tr")).toHaveCount(6);
  await expect(page.locator(".attention-list li")).toHaveCount(5);
  await page.getByRole("link", { name: "全件を見る (8)", exact: true }).click();
  await expect(page.locator(".attention-list li")).toHaveCount(8);
  await expect(
    page.getByRole("link", { name: "全ソースを見る (9)" }),
  ).toBeVisible();
});
for (const width of [1440, 390]) {
  test(`Source inventory retains all six columns and Overview row density at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/");
    const overviewRow = page.locator(".source-table tbody tr").first();
    await expect(overviewRow).toBeVisible();
    const overviewHeight = await overviewRow.evaluate(
      (row) => row.getBoundingClientRect().height,
    );
    const overviewLimit = await page
      .getByRole("region", { name: "ソース状況一覧" })
      .evaluate((region) => getComputedStyle(region).maxHeight);
    const sources = operational("sources");
    sources.sources = Array.from({ length: 15 }, (_, i) =>
      sourceDTO(i === 0 ? "ecb" : `synthetic-source-${i}`),
    );
    await page.route("**/api/sources", (route) =>
      route.fulfill({ json: sources }),
    );
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("link", { name: "Sources", exact: true })
      .click();
    const inventory = page.getByRole("table").filter({
      has: page.getByRole("columnheader", { name: "設定状態", exact: true }),
    });
    await expect(inventory.locator("tbody tr")).toHaveCount(15);
    const layout = await inventory.evaluate((table) => ({
      widths: Array.from(table.querySelectorAll("thead th")).map(
        (cell) => cell.getBoundingClientRect().width,
      ),
      rowHeight: table.querySelector("tbody tr")!.getBoundingClientRect()
        .height,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }));
    expect(layout.widths).toHaveLength(6);
    expect(Math.min(...layout.widths)).toBeGreaterThan(80);
    expect(layout.rowHeight).toBeLessThanOrEqual(overviewHeight + 24);
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    const region = page.getByRole("region", { name: "全ソース一覧" });
    const viewport = await region.evaluate((element) => ({
      limit: getComputedStyle(element).maxHeight,
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    }));
    expect(viewport.limit).toBe(overviewLimit);
    expect(viewport.height).toBeLessThanOrEqual(480);
    expect(viewport.contentHeight).toBeGreaterThan(viewport.height);
    await region.focus();
    await expect(region).toBeFocused();
    await region.press("End");
    const lastSettings = inventory
      .getByRole("link", { name: "Settings", exact: true })
      .last();
    await lastSettings.focus();
    const scrolled = await region.evaluate((element) => ({
      scrollTop: element.scrollTop,
      top: element.getBoundingClientRect().top,
      headerTop: element.querySelector("th")!.getBoundingClientRect().top,
    }));
    expect(scrolled.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(scrolled.headerTop - scrolled.top)).toBeLessThan(2);
    await lastSettings.press("Enter");
    await expect(page).toHaveURL(/#settings\?source=synthetic-source-14/);
    await page.goBack();
    const settings = inventory
      .getByRole("link", { name: "Settings", exact: true })
      .first();
    await settings.focus();
    await expect(settings).toBeFocused();
    await page.screenshot({
      path: `work/screenshots/synthetic-source-inventory-${width}.png`,
      fullPage: false,
    });
    await settings.press("Enter");
    await expect(page).toHaveURL(/#settings\?source=ecb/);
  });
}
test("all navigation destinations work, deep links and native back preserve filters", async ({
  page,
}) => {
  await page.goto("/#runs?source=ecb&run=ecb-run");
  await expect(
    page.getByRole("heading", { name: "Run ecb-run", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "Data", exact: true })
    .click();
  await expect(page).toHaveURL(/#data\?source=ecb&run=ecb-run/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Run ecb-run", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Sources",
    "Rights",
    "Settings",
    "Releases",
    "Infrastructure",
    "Overview",
  ]) {
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true, level: 1 }),
    ).toBeVisible();
  }
});
test("Data pages all 125 models without the previous 100-record ceiling", async ({
  page,
}) => {
  await page.goto("/#data");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  await expect(page.locator(".data-table")).toContainText("synthetic-model-0");
  await page.getByRole("link", { name: "次の50件" }).click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  await expect(page.locator(".data-table")).toContainText("synthetic-model-99");
  await page.getByRole("link", { name: "次の50件" }).click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(25);
  await expect(page.locator(".data-table")).toContainText(
    "synthetic-model-124",
  );
  await expect(page.getByRole("link", { name: "次の50件" })).toHaveCount(0);
  await page.goBack();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
});
test("Data detail preserves decimals, nulls, price conditions, attribution and JSON", async ({
  page,
}) => {
  await page.goto("/#data?id=model-1");
  await expect(
    page.getByRole("heading", { name: "synthetic-model-1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".field-list").first()).toContainText(
    "0.1234567890123456789",
  );
  await expect(page.locator(".field-list").first()).toContainText(
    "USD / million_tokens",
  );
  await expect(page.locator(".field-list").first()).toContainText(
    "synthetic tier A",
  );
  await expect(page.locator(".field-list").first()).toContainText("未提供");
  await expect(
    page.getByText("Synthetic attribution", { exact: true }),
  ).toBeVisible();
  await page.getByText("表示用JSON・元のUTC時刻", { exact: true }).click();
  await expect(page.locator("pre").last()).toContainText(
    '"data_origin": "synthetic"',
  );
  await page.screenshot({
    path: "work/screenshots/synthetic-data-detail-v2.png",
    fullPage: true,
  });
});
test("legacy initial check remains fixed in Runs and loads only when expanded", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T18:15:59Z"));
  await page.goto("/#runs");
  await page.getByTestId("initial-details").locator(":scope > summary").click();
  await expect(page.getByRole("timer")).toHaveText("00:01:01");
  await page.clock.setFixedTime(new Date("2026-09-30T18:17:00Z"));
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.locator(".initial-target")).toContainText(
    "2026/09/30 03:17:00 JST",
  );
  await expect(page.getByTestId("initial-details")).toContainText(
    "対象2ソースの公開観測を確認",
  );
});
test("Rights, Settings and Releases show distinct evidence and unknown mappings", async ({
  page,
}) => {
  await page.goto("/#rights");
  await expect(page.locator(".rights-table thead th")).toHaveCount(11);
  await expect(page.locator(".rights-table")).toContainText("seven_days");
  await page.goto("/#settings");
  await expect(page.getByText("Collector Cron照合：一致")).toBeVisible();
  await expect(
    page.getByText("notification_not_configured", { exact: true }),
  ).toBeVisible();
  await page.goto("/#releases");
  await expect(page.locator(".release-grid")).toContainText("未照合");
  await expect(
    page.getByText(/private \/ 0005_admin_release_ledger.sql/),
  ).toBeVisible();
});
test("unavailable internal records do not produce healthy or zero totals", async ({
  page,
}) => {
  await page.route("**/api/overview", (route) =>
    route.fulfill({
      json: {
        schema_version: "admin-read-v1",
        resource: "overview",
        fetched_at: READ_AT,
        as_of: READ_AT,
        state: "unavailable",
        issues: ["admin_read_unavailable"],
        next_cursor: null,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("overview-summary")).toContainText("未確認");
  await expect(page.getByTestId("overview-summary")).not.toContainText("0 / 0");
  await expect(
    page.getByText("収集・公開の内部記録を取得できません", { exact: true }),
  ).toBeVisible();
});
test("unimplemented electricity is distinct from empty or failed collection", async ({
  page,
}) => {
  await page.goto("/#data?dataset=electricity");
  await expect(
    page.getByText(/このデータ種別は現在のCollectorに未導入/),
  ).toBeVisible();
  await expect(page.locator(".data-table")).toHaveCount(0);
});
test("leaving Runs stops its polling; Data remains manual and auto off does not fetch", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.push(r.url());
  });
  await page.goto("/#runs");
  await expect(
    page.getByRole("heading", { name: "Collection runs" }),
  ).toBeVisible();
  await page.goto("/#data");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  const before = calls.length;
  await page.clock.runFor(130000);
  expect(calls.length).toBe(before);
  await page.getByRole("checkbox", { name: "自動更新" }).uncheck();
  await page.clock.runFor(130000);
  expect(calls.length).toBe(before);
});
test("mobile layout and keyboard links stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".source-table tbody tr")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "Data", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/screenshots/synthetic-mobile-data-v2.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "work/screenshots/synthetic-mobile-viewport-v2.png",
  });
});

test("Runs refreshes after 60 seconds and stops while the document is hidden", async ({
  page,
}) => {
  let calls = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/runs") calls++;
  });
  await page.goto("/#runs");
  await expect(
    page.getByRole("heading", { name: "Collection runs" }),
  ).toBeVisible();
  const before = calls;
  await page.clock.runFor(61000);
  await expect.poll(() => calls).toBe(before + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(130000);
  expect(calls).toBe(before + 1);
});
test("cutoff deep links can refresh to current data and time display can switch to UTC", async ({
  page,
}) => {
  await page.goto(
    "/#runs?run=" +
      sourceDTO("ecb").last_run!.run_id +
      "&as_of=" +
      encodeURIComponent(READ_AT),
  );
  await expect(
    page.getByRole("heading", { name: "Collection runs" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "自動更新" }).uncheck();
  await page.clock.runFor(61000);
  await page.getByRole("button", { name: "今すぐ更新", exact: true }).click();
  await expect(page).not.toHaveURL(/as_of/);
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "表示タイムゾーン" })
    .selectOption("UTC");
  await expect(page.locator(".source-table")).toContainText(
    "2026/09/29 18:18:00 UTC",
  );
});

test("Worker preserves GET-only and rejects arbitrary query before invoking any binding", async ({
  request,
}) => {
  expect((await request.post("/api/runs")).status()).toBe(405);
  expect(
    (await request.get("/api/runs?url=https://example.com")).status(),
  ).toBe(400);
  expect((await request.get("/api/not-a-resource")).status()).toBe(404);
});

test("Infrastructure labels Analytics storage and its sample time without existence claims", async ({ page }) => {
  await page.goto("/#infrastructure");
  await expect(page.getByRole("heading", { name: "D1 databases" })).toBeVisible();
  await expect(page.getByText("Analytics · 最新容量サンプル")).toBeVisible();
  await expect(page.getByText("容量サンプル：", { exact: false })).toHaveCount(2);
  await expect(page.getByText("D1・R2容量はAnalyticsの最新サンプルです。", { exact: false })).toBeVisible();
});
