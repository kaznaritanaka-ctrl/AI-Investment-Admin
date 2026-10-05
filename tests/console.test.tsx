import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OverviewPage,
  infrastructureAttention,
  Fields,
} from "../src/console-ui.tsx";
import {
  DataDetail,
  DataPage,
  RightsPage,
  ReleasesPage,
} from "../src/ConsolePages.tsx";
import { parseLocation, retained, href } from "../src/console-router.ts";
import { operational, sourceDTO, dataRow } from "./admin-fixtures.ts";
import { infrastructureFixture } from "./infrastructure-fixtures.ts";
import { NOW } from "./fixtures.ts";
import { adminProxy } from "../src/admin-proxy.ts";
import { handle } from "../src/worker.ts";
it("renders monthly electricity periods and original units without treating the period as an observation date", () => {
  const report = operational("data");
  const row = dataRow();
  row.dataset = "electricity";
  row.source_id = "synthetic_energy";
  row.entity_key = "JP/industry";
  row.source_period = "2026-09";
  row.fields = [
    { name: "area", value: "JP", unit: null },
    { name: "period", value: "2026-09", unit: null },
    { name: "amount_decimal", value: "0.123456789", unit: "USD / kWh" },
  ];
  row.public_fields = row.fields;
  report.data = [row];
  const html = renderToStaticMarkup(
    <DataPage
      report={report}
      location={parseLocation("#data?dataset=electricity")}
    />,
  );
  expect(html).toContain("地域 / 対象期間");
  expect(html).toContain("2026-09");
  expect(html).toContain("USD / kWh");
  expect(html).toContain("0.123456789");
});
it("Overview is bounded to four cards, five issues, six sources and links all results", () => {
  const r = operational("overview");
  r.overview!.sources = Array.from({ length: 10 }, (_, i) =>
    sourceDTO("source_" + i),
  );
  r.overview!.attention = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    severity: "warning",
    message: "Issue " + i,
    page: "runs",
    source: "source_" + i,
    run: null,
  }));
  const html = renderToStaticMarkup(
    <OverviewPage report={r} infra={infrastructureFixture()} now={NOW} />,
  );
  expect(html.match(/class="stat stat-link"/g)).toHaveLength(4);
  expect(html.match(/<tr>/g)).toHaveLength(7);
  expect(html.match(/Issue /g)).toHaveLength(5);
  expect(html).toContain("全件を見る (9)");
  expect(html).toContain("全ソースを見る (10)");
  expect(html).not.toMatch(/AI API Prices|Raw JSON|Worker CPU|初回確認/);
});
it("does not treat unknown checks or decimal/null values as success or zero", () => {
  const html = renderToStaticMarkup(
    <OverviewPage report={null} infra={null} now={NOW} />,
  );
  expect(html).toContain("未確認");
  expect(html).not.toContain("0 / 0");
  const detail = renderToStaticMarkup(<DataDetail row={dataRow()} />);
  expect(detail).toContain("0.1234567890123456789");
  expect(detail).toContain("未提供");
  expect(detail).toContain("synthetic tier A");
});
it("keeps private and public DB capacity separate", () => {
  const infra = infrastructureFixture();
  infra.plan.value = "paid";
  infra.d1[0].metadata.storage_bytes = 8_500_000_000;
  infra.d1[1].metadata.storage_bytes = 1_000_000_000;
  const alerts = infrastructureAttention(infra, NOW).filter((x) =>
    x.id.endsWith("-capacity"),
  );
  expect(alerts).toHaveLength(1);
  expect(alerts[0].message).toContain(infra.d1[0].name);
});
it("renders rights for nine purposes and never guesses a release SHA", () => {
  expect(
    renderToStaticMarkup(<RightsPage report={operational("rights")} />),
  ).toContain("seven_days");
  const html = renderToStaticMarkup(
    <ReleasesPage
      report={operational("releases")}
      infra={infrastructureFixture()}
      location={parseLocation("#releases")}
    />,
  );
  expect(html).toContain("未照合");
  expect(html).toContain("0005_admin_release_ledger.sql");
});
it("deep links retain compatible filters and browser-native history", () => {
  const location = parseLocation(
    href("Runs", {
      source: "ecb",
      run: "old-run",
      from: "2026-09-29T00:00:00.000Z",
    }),
  );
  expect(location.page).toBe("Runs");
  expect(retained(location, "Data")).toMatchObject({
    source: "ecb",
    run: "old-run",
  });
  expect(retained(location, "Rights")).toEqual({ source: "ecb" });
});
it("API refuses arbitrary queries and duplicates before calling the service", async () => {
  const read = vi.fn().mockResolvedValue(operational("runs"));
  for (const query of [
    "?url=https://evil.test",
    "?source=a&source=b",
    "?limit=101",
    "?sql=SELECT",
  ]) {
    expect(
      (
        await adminProxy(
          new URL("https://admin.ai-investment-research.net/api/runs" + query),
          { read },
        )
      ).status,
    ).toBe(400);
  }
  expect(read).not.toHaveBeenCalled();
  const response = await adminProxy(
    new URL("https://admin.ai-investment-research.net/api/runs"),
    { read },
  );
  expect((await response.json()).state).toBe("ready");
});
it("service failure, missing binding and extra private fields fail closed", async () => {
  const url = new URL("https://admin.ai-investment-research.net/api/overview");
  expect((await (await adminProxy(url)).json()).issues).toContain(
    "admin_read_binding_not_configured",
  );
  const bad = await adminProxy(url, {
    read: async () => ({
      ...operational("overview"),
      secret: "private-sentinel",
    }),
  });
  expect(await bad.text()).not.toContain("private-sentinel");
});
it("new API routes preserve GET-only, origin restrictions and no-store headers", async () => {
  const read = vi.fn().mockResolvedValue(operational("runs"));
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_READ: { read },
  };
  for (const req of [
    new Request("https://admin.ai-investment-research.net/api/runs", {
      method: "POST",
    }),
    new Request("https://other.test/api/runs"),
    new Request("https://admin.ai-investment-research.net/api/runs", {
      headers: { origin: "https://evil.test" },
    }),
  ])
    expect((await handle(req, env)).status).toBeGreaterThanOrEqual(400);
  expect(read).not.toHaveBeenCalled();
  const r = await handle(
    new Request("https://admin.ai-investment-research.net/api/runs"),
    env,
  );
  expect(r.headers.get("cache-control")).toBe("no-store");
});
