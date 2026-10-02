import { INITIAL_SLOT, TARGETS } from "./contracts.ts";
import type { Status, Observation, Health } from "./contracts.ts";
export const display = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? "未提供"
    : String(value);
export function jst(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "未提供";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts + " JST";
}
export function scheduleLabel(now: number) {
  return now < Date.parse(INITIAL_SLOT)
    ? "初回予定時刻前"
    : "予定時刻経過・公開結果を確認中";
}
export function collectionLabel(collector: Health["collector"]) {
  if (collector.collection_enabled === 1) return "最終記録では有効";
  if (collector.last_collector_completed_at === null) return "実行報告未受信";
  return "最終記録では無効（現在の設定は未確認）";
}
export function observations(report: Status | null): Observation[] {
  if (!report) return [];
  const { latest, fx } = report.endpoints;
  // The unfiltered response can be filled by 100 model rows. FX is authoritative
  // only in its own response; do not duplicate or fall back to unfiltered FX.
  return [
    ...(latest.state === "ok"
      ? latest.data!.data.filter((o) => o.dataset !== "fx")
      : []),
    ...(fx.state === "ok" ? fx.data!.data : []),
  ].filter((o) => o.data_origin === "live");
}
export function observationEndpoint(report: Status | null, dataset?: string) {
  return report?.endpoints[dataset === "fx" ? "fx" : "latest"];
}
export function sourceChecks(report: Status | null) {
  const rows = observations(report);
  return TARGETS.map((target) => {
    const result = observationEndpoint(report, target.dataset);
    const unavailable = !result || result.state === "error";
    const matches = rows.filter(
      (o) => o.source.source_id === target.id && o.dataset === target.dataset,
    );
    const latest = matches.reduce<string | null>(
      (acc, o) =>
        !acc || Date.parse(o.observed_at) > Date.parse(acc)
          ? o.observed_at
          : acc,
      null,
    );
    const confirmed =
      latest !== null && Date.parse(latest) >= Date.parse(INITIAL_SLOT);
    return {
      ...target,
      rows: matches,
      latest,
      confirmed,
      label: unavailable
        ? "取得エラー"
        : confirmed
          ? "公開観測確認済み"
          : latest
            ? "古い観測のみ"
            : "まだ未確認",
      tone: unavailable
        ? "error"
        : confirmed
          ? "success"
          : latest
            ? "warning"
            : "neutral",
    };
  });
}
export function assessment(report: Status | null, now: number) {
  const checks = sourceChecks(report);
  const count = checks.filter((s) => s.confirmed).length;
  if (count === 2)
    return { label: "対象2ソースの公開観測を確認", tone: "success" };
  if (count === 1) return { label: "一部確認済み", tone: "warning" };
  if (checks.some((s) => s.tone === "error"))
    return { label: "判定できない", tone: "error" };
  if (now >= Date.parse(INITIAL_SLOT) + 15 * 60000)
    return { label: "要確認：まだ公開観測を確認できません", tone: "warning" };
  return {
    label:
      now >= Date.parse(INITIAL_SLOT)
        ? "予定時刻経過・公開結果を確認中"
        : "初回公開観測はまだ未確認",
    tone: "neutral",
  };
}
export function publicDataLabel(report: Status | null) {
  if (!report) return "現在確認できない";
  const { health, latest, fx } = report.endpoints;
  if (observations(report).length > 0) return "あり";
  if (health.state === "ok" && health.data!.status === "public_data_available")
    return "あり";
  if (
    health.state === "ok" &&
    health.data!.status === "no_public_data" &&
    health.data!.datasets.length === 0 &&
    [latest, fx].every(
      (result) => result.state === "empty" ||
        (result.state === "ok" && result.data!.data.length === 0),
    )
  )
    return "なし";
  return "現在確認できない";
}
export function apiLabel(report: Status | null) {
  if (!report) return "接続失敗／未取得";
  const entries = Object.values(report.endpoints);
  if (
    entries.some(
      (r) => r.error_kind === "format" || r.error_kind === "too_large",
    )
  )
    return "応答形式エラー";
  const failures = entries.filter((r) => r.state === "error");
  if (failures.length)
    return failures.length === entries.length ? "接続失敗" : "一部取得失敗";
  return "取得成功";
}
export function freshnessLabel(o: Observation) {
  const reason: Record<string, string> = {
    collection_overdue: "観測時刻の遅れ",
    expected_reference_date_missing: "期待される元データ日付が未確認",
    newer_observation_quarantined: "新しい観測が隔離中",
  };
  const labels = [
    o.stale
      ? "鮮度注意：" +
        (reason[o.stale_reason ?? ""] ?? o.stale_reason ?? "理由未提供")
      : "API鮮度判定：遅延なし",
    ...o.quality_flags,
  ];
  if (o.fx_reference?.fx_carried_forward)
    labels.push("元データは前日以前の参照値");
  return labels.join(" ／ ");
}
