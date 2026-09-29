import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard } from "../src/Dashboard.tsx";
import { StatusSchema, LatestSchema, INITIAL_SLOT } from "../src/contracts.ts";
import {
  assessment,
  sourceChecks,
  publicDataLabel,
  collectionLabel,
  jst,
  scheduleLabel,
  display,
} from "../src/view-model.ts";
import { report, fx, ai, failure, ok, NOW, STAMP } from "./fixtures.ts";

describe("初動確認は実観測に限定する", () => {
  it("空health、null、空配列、no_observationは正常な空状態", () => {
    const r = report();
    expect(StatusSchema.safeParse(r).success).toBe(true);
    expect(publicDataLabel(r)).toBe("なし");
    expect(collectionLabel(r.endpoints.health.data!.collector)).toBe(
      "実行報告未受信",
    );
    expect(sourceChecks(r).map((s) => s.label)).toEqual([
      "まだ未確認",
      "まだ未確認",
    ]);
  });
  it("Collector時刻だけ更新されてもソース成功と判定しない", () => {
    const r = report();
    r.endpoints.health.data!.collector = {
      last_collector_completed_at: STAMP,
      collection_enabled: 1,
      monitor_connected: 0,
    };
    expect(sourceChecks(r).every((s) => !s.confirmed)).toBe(true);
    expect(assessment(r, NOW).label).toBe(
      "要確認：まだ公開観測を確認できません",
    );
  });
  it("ECBだけは一部確認済み、両方は2ソース確認", () => {
    expect(assessment(report([fx()]), NOW).label).toBe("一部確認済み");
    expect(assessment(report([fx(), ai()]), NOW).label).toBe(
      "対象2ソースの公開観測を確認",
    );
  });
  it("source_dateが前日でもobserved_atが新しければ確認済み", () => {
    expect(sourceChecks(report([fx()]))[0].confirmed).toBe(true);
  });
  it("古い観測のみ・異なるsource/dataset・syntheticを確認済みにしない", () => {
    const old = "2026-09-29T18:16:59.999Z";
    expect(
      sourceChecks(report([fx(old), ai(old)])).map((s) => s.label),
    ).toEqual(["古い観測のみ", "古い観測のみ"]);
    expect(
      sourceChecks(
        report([
          { ...fx(), source: { ...fx().source, source_id: "models_dev" } },
        ]),
      ).every((s) => !s.confirmed),
    ).toBe(true);
    expect(
      sourceChecks(report([{ ...fx(), data_origin: "synthetic" }]))[0]
        .confirmed,
    ).toBe(false);
  });
  it("latestが失敗すれば判定不能、sourcesのみの失敗では実観測を消さない", () => {
    const r = report([fx(), ai()]);
    r.endpoints.sources = failure();
    expect(assessment(r, NOW).tone).toBe("success");
    r.endpoints.latest = failure("timeout");
    expect(assessment(r, NOW).label).toBe("判定できない");
    expect(sourceChecks(r).map((s) => s.label)).toEqual([
      "取得エラー",
      "取得エラー",
    ]);
  });
  it("healthが失敗したとき公開なしと断定しない", () => {
    const r = report();
    r.endpoints.health = failure();
    expect(publicDataLabel(r)).toBe("現在確認できない");
  });
  it("UTCからJST、初回時刻ちょうど、15分境界、翌日も初回時刻固定", () => {
    expect(jst("2026-09-29T18:17:00Z")).toBe("2026/09/30 03:17:00 JST");
    const slot = Date.parse(INITIAL_SLOT);
    expect(scheduleLabel(slot - 1)).toBe("初回予定時刻前");
    expect(scheduleLabel(slot)).toBe("予定時刻経過・公開結果を確認中");
    expect(
      sourceChecks(report([fx(new Date(slot).toISOString())]))[0].confirmed,
    ).toBe(true);
    expect(assessment(report(), slot + 15 * 60000 - 1).tone).toBe("neutral");
    expect(assessment(report(), slot + 15 * 60000).tone).toBe("warning");
    expect(scheduleLabel(slot + 86400000)).toContain("予定時刻経過");
  });
  it("nullを0にせずdecimal文字列をそのまま描画しHTMLをエスケープ", () => {
    const r = report([fx(), ai()]);
    r.endpoints.latest.data!.data[1].attribution = "<script>alert(1)</script>";
    const html = renderToStaticMarkup(
      <Dashboard
        state={{
          report: r,
          busy: false,
          auto: true,
          hidden: false,
          receivedAt: STAMP,
          attemptedAt: STAMP,
          error: null,
          nextAllowedAt: 0,
        }}
        now={NOW}
        refresh={() => {}}
        setAuto={() => {}}
      />,
    );
    expect(html).toContain('<td class="number">未提供</td>');
    expect(html).toContain("0.123456789012345678");
    expect(html).toContain("1.234567890123456789");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("外部監視未接続");
    expect(html).toContain("公開中の観測件数（API集計）");
    expect(display(null)).toBe("未提供");
    expect(display("0")).toBe("0");
  });
  it("小数のnumber、不正時刻・危険URL・想像したflat source_idを拒否", () => {
    const bad = { ...fx(), value: { ...fx().value, rate_decimal: 1.23 } };
    for (const row of [
      bad,
      { ...fx(), observed_at: "yesterday" },
      {
        ...fx(),
        source: { ...fx().source, source_url: "javascript:alert(1)" },
      },
      { ...fx(), source: undefined, source_id: "ecb" },
    ])
      expect(
        LatestSchema.safeParse({ schema_version: "1", data: [row] }).success,
      ).toBe(false);
  });
  it("空latest 200も扱い、非数値の欠けた価格は未提供のまま", () => {
    const r = report();
    r.endpoints.latest = ok({ schema_version: "1", data: [] });
    expect(publicDataLabel(r)).toBe("なし");
    const a = ai();
    if (a.dataset === "ai_api_prices") delete a.value.price_components;
    expect(
      LatestSchema.safeParse({ schema_version: "1", data: [a] }).success,
    ).toBe(true);
  });
});
