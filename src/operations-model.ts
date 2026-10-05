import { TARGETS } from "./contracts.ts";
import type { Status } from "./contracts.ts";
import { observations, observationEndpoint } from "./view-model.ts";
import { infrastructureStale } from "./infrastructure-contract.ts";
import type { Infrastructure } from "./infrastructure-contract.ts";

export function sourceRows(report: Status | null, now: number) {
  const rows = observations(report),
    metadata = report?.endpoints.sources.data?.data ?? [];
  const ids = [
    ...new Set([
      ...TARGETS.map((t) => t.id),
      ...metadata.map((s) => s.source_id),
      ...rows.map((o) => o.source.source_id),
    ]),
  ];
  return ids.map((id) => {
    const target = TARGETS.find((t) => t.id === id);
    const matches = rows.filter(
      (o) =>
        o.source.source_id === id && (!target || o.dataset === target.dataset),
    );
    const newest = matches
      .slice()
      .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
    const source = metadata.find((s) => s.source_id === id);
    const result = observationEndpoint(report, target?.dataset ?? newest?.dataset);
    const freshness = !newest
      ? "Unknown"
      : matches.some((o) => o.stale) ||
          now - Date.parse(newest.observed_at) > 36 * 3600000
        ? "Warning"
        : "Healthy";
    return {
      id,
      name: target?.name ?? source?.operator ?? id,
      dataset:
        target?.dataset ??
        ([...new Set(matches.map((o) => o.dataset))].join(", ") || null),
      latest: newest?.observed_at ?? null,
      sourceDate: newest?.source_date ?? null,
      count:
        result && result.state !== "error"
          ? matches.length
          : null,
      freshness,
      rows: matches,
      source,
      // The public source contract does not expose current Collector switches/deadlines.
      enabled: null,
      validUntil: null,
      reviewDeadline: null,
      retention: null,
    };
  });
}
export function operationsHealth(
  report: Status | null,
  infra: Infrastructure | null,
  now: number,
) {
  const sources = sourceRows(report, now);
  if (
    (report &&
      Object.values(report.endpoints).some((e) => e.state === "error")) ||
    sources.some((s) => s.freshness === "Warning") ||
    infra?.workers.some(
      (w) =>
        (w.metrics.errors !== null && w.metrics.errors > 0) ||
        w.metadata.state === "missing",
    )
  )
    return "Warning";
  if (
    !report ||
    sources.some((s) => s.freshness === "Unknown") ||
    !infra ||
    infra.availability !== "ready" ||
    infrastructureStale(infra, now)
  )
    return "Unknown";
  return "Healthy";
}
export function attentionItems(
  report: Status | null,
  infra: Infrastructure | null,
  now: number,
): string[] {
  const items: string[] = [];
  if (
    !report ||
    Object.values(report.endpoints).some((e) => e.state === "error")
  )
    items.push("公開APIに未取得・失敗あり。HTTP結果を確認してください。");
  for (const s of sourceRows(report, now))
    if (s.freshness !== "Healthy")
      items.push(
        `${s.name}: ${s.freshness} — live観測の鮮度・取得範囲を確認。`,
      );
  for (const s of sourceRows(report, now))
    if (
      s.source &&
      Object.values(s.source.rights).some(
        (v) => v === "review_required" || v === "expired",
      )
    )
      items.push(
        `${s.name}: 公開rightsにreview_required / expiredあり。公開policyの条件を確認。`,
      );
  if (!infra || infra.availability === "unavailable")
    items.push(
      "Cloudflare metrics unavailable — Secret・権限・接続状態を確認。",
    );
  else {
    if (infra.availability === "partial")
      items.push(
        "Cloudflare情報は一部未取得。Infrastructureの項目別状態を確認。",
      );
    if (infrastructureStale(infra, now))
      items.push("Cloudflare情報の取得から15分超。古い表示です。");
    for (const w of infra.workers) {
      if (w.metrics.errors !== null && w.metrics.errors > 0)
        items.push(
          `${w.name}: runtime errors ${w.metrics.errors}（直近24時間）。`,
        );
      if (w.metadata.state === "missing")
        items.push(`${w.name}: Cloudflare APIで見つかりません。`);
      if (
        w.name !== "ai-investment-api" &&
        (w.exposure.workers_dev === true || w.exposure.preview_urls === true)
      )
        items.push(`${w.name}: workers.dev / preview URLの公開状態を要確認。`);
    }
    for (const db of infra.d1)
      if (db.metadata.state === "missing")
        items.push(`${db.name}: Cloudflare APIで見つかりません。`);
    if (infra.r2.metadata.state === "missing")
      items.push(`${infra.r2.name}: Cloudflare APIで見つかりません。`);
    if (infra.r2.storage.state === "stale")
      items.push("R2 storage: 6時間超前のサンプルです。");
  }
  if (!infra || infra.plan.value === "unknown")
    items.push("Workers plan未確認。Ownerの確認日時付きevidenceが必要です。");
  else if (
    infra.plan.verified_at &&
    now - Date.parse(infra.plan.verified_at) > 7 * 86400000
  )
    items.push("Workers planのmanual evidenceが7日超。再レビュー対象です。");
  items.push(
    "Watchdog / continuationの実行結果・checkpointは未取得。Cronの存在だけでは成功と判定しません。",
  );
  items.push(
    "rights valid_until / review deadline / retentionは公開API未提供。期限内とは判定できません。",
  );
  return items;
}
