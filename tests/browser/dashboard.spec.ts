import { test, expect } from "@playwright/test";
import { report, fx, ai, NOW, failure } from "../fixtures.ts";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) });
});
test("空状態・readonly・JSON・スマートフォンでも横崩れしない", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: report() }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "AI Investment Research｜収集状況" }),
  ).toBeVisible();
  await expect(page.getByText("実行報告未受信")).toBeVisible();
  await expect(
    page.getByText("対象2ソースの公開観測を確認", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("外部監視未接続")).toBeVisible();
  await page
    .getByText("取得したJSONとエンドポイント別の結果（元のUTC時刻を含む）")
    .click();
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
  await expect(
    page.getByText("対象2ソースの公開観測を確認", { exact: true }),
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
  await page.getByRole("button", { name: "今すぐ表示を更新" }).click();
  await expect(
    page.getByRole("cell", { name: "0.123456789012345678", exact: true }),
  ).toHaveCount(0);
  current.endpoints.latest = failure("timeout");
  await page.clock.fastForward(6000);
  await page.getByRole("button", { name: "今すぐ表示を更新" }).click();
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
  await expect(page.getByText("一部確認済み", { exact: true })).toBeVisible();
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
