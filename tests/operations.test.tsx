import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  sourceRows,
  attentionItems,
  operationsHealth,
} from "../src/operations-model.ts";
import { SourcesPage, InfrastructurePage } from "../src/Operations.tsx";
import { infrastructureFixture } from "./infrastructure-fixtures.ts";
import { report, ai, fx, NOW, STAMP, sourceMetadata } from "./fixtures.ts";

it("公開metadataのrights/version/limitationを表示しレビュー対象を示す", () => {
  const r = report([fx(), ai()]);
  r.endpoints.sources.data!.data = [
    sourceMetadata("ecb"),
    sourceMetadata("models_dev"),
  ];
  const html = renderToStaticMarkup(<SourcesPage report={r} now={NOW} />);
  expect(html).toContain("synthetic-policy-v1");
  expect(html).toContain("commercial_reuse: review_required");
  expect(html).toContain("Synthetic coverage limitation");
  expect(html).toContain("有効・無効：未取得");
  expect(attentionItems(r, infrastructureFixture(), NOW).join(" ")).toContain(
    "Models.dev: 公開rightsにreview_required / expiredあり",
  );
});

it("HTTP successとCollector記録だけではHealthyにならない", () => {
  const r = report();
  r.endpoints.health.data!.collector.last_collector_completed_at = STAMP;
  expect(sourceRows(r, NOW).every((s) => s.freshness === "Unknown")).toBe(true);
  expect(operationsHealth(r, infrastructureFixture(), NOW)).toBe("Unknown");
});
it("価格不変でもfresh live観測ならHealthy。36時間超・API staleはWarning", () => {
  const r = report([fx(), ai()]);
  expect(sourceRows(r, NOW).map((s) => s.freshness)).toEqual([
    "Healthy",
    "Healthy",
  ]);
  expect(operationsHealth(r, infrastructureFixture(), NOW)).toBe("Healthy");
  expect(sourceRows(r, NOW + 37 * 3600000).map((s) => s.freshness)).toEqual([
    "Warning",
    "Warning",
  ]);
  r.endpoints.fx.data!.data[0].stale = true;
  expect(sourceRows(r, NOW)[0].freshness).toBe("Warning");
});
it("公開APIにないenable/policy期限/retentionは推測しない。未来sourceのダミー行なし", () => {
  const html = renderToStaticMarkup(
    <SourcesPage report={report([fx(), ai()])} now={NOW} />,
  );
  expect(html).toContain("有効・無効：未取得");
  expect(html).toContain("現行公開APIでは期限・retention非提供");
  expect(html).not.toContain("disabled</td>");
  expect(sourceRows(report(), NOW).map((s) => s.id)).toEqual([
    "ecb",
    "models_dev",
  ]);
  expect(sourceRows(report([fx(), ai()]), NOW)[0]).toMatchObject({
    sourceDate: "2026-09-28",
    latest: STAMP,
    count: 1,
    enabled: null,
  });
});
it("Attentionはruntime error、stale、期限未取得、watchdogを成功としない", () => {
  const r = infrastructureFixture();
  r.workers[0].metrics.errors = 3;
  expect(
    attentionItems(report([fx(), ai()]), r, NOW + 900001).join(" "),
  ).toMatch(/runtime errors 3/);
  expect(attentionItems(report(), r, NOW + 900001).join(" ")).toContain(
    "古い表示",
  );
  expect(attentionItems(report(), r, NOW).join(" ")).toContain(
    "checkpointは未取得",
  );
  expect(attentionItems(report(), r, NOW).join(" ")).toContain(
    "期限内とは判定できません",
  );
});
it("Infrastructure未取得を明示し、null値の0変換なし", () => {
  const html = renderToStaticMarkup(
    <InfrastructurePage
      state={{
        report: infrastructureFixture(false),
        busy: false,
        error: null,
        nextAllowedAt: 0,
      }}
      now={NOW}
      refresh={() => {}}
    />,
  );
  expect(html).toContain("Cloudflare metrics unavailable");
  expect(html).toContain("Worker Secretの登録には所有者の承認");
  expect(html).not.toContain("0 MiB");
  expect(html).not.toContain('<td class="mono">0 / 0');
});
