import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Report, SourceDTO, RunDTO, FieldDTO } from "./admin-contract.ts";
import type { Infrastructure } from "./infrastructure-contract.ts";
import { infrastructureStale } from "./infrastructure-contract.ts";
import { href } from "./console-router.ts";
import type { Page, Location } from "./console-router.ts";
export const Timezone = createContext("Asia/Tokyo");
export const show = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "未提供"
    : typeof v === "boolean"
      ? v
        ? "ON"
        : "OFF"
      : String(v);
export function Timestamp({ value }: { value?: string | null }) {
  const zone = useContext(Timezone);
  if (!value || !Number.isFinite(Date.parse(value)))
    return <span className="muted">未取得</span>;
  return (
    <time dateTime={value} title={new Date(value).toISOString()}>
      {new Intl.DateTimeFormat("ja-JP", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value))}{" "}
      {zone === "UTC" ? "UTC" : "JST"}
    </time>
  );
}
export function Badge({ value }: { value: string | null | undefined }) {
  const good = [
    "complete",
    "healthy",
    "ready",
    "allowed",
    "sent",
    "verified",
  ].includes(value ?? "");
  const bad = [
    "failed",
    "missing",
    "expired",
    "denied",
    "held",
    "attempts_exhausted",
    "warning",
    "error",
  ].includes(value ?? "");
  return (
    <span
      className={"badge " + (good ? "success" : bad ? "warning" : "neutral")}
    >
      {value ?? "未取得"}
    </span>
  );
}
export function Panel({
  title,
  children,
  tools,
}: {
  title: string;
  children: ReactNode;
  tools?: ReactNode;
}) {
  return (
    <section className="panel console-panel">
      <div className="section-head">
        <h2>{title}</h2>
        {tools}
      </div>
      <div className="panel-content">{children}</div>
    </section>
  );
}
export function Empty({
  children = "該当する記録はありません。",
}: {
  children?: ReactNode;
}) {
  return <p className="empty-text">{children}</p>;
}
export function Related({
  source,
  run,
  asOf,
}: {
  source: string;
  run?: string | null;
  asOf?: string;
}) {
  return (
    <div className="related-links">
      {(["Sources", "Runs", "Data", "Rights", "Settings"] as Page[]).map(
        (p) => (
          <a
            key={p}
            href={href(p, {
              source,
              ...(["Runs", "Data"].includes(p) ? { run, as_of: asOf } : {}),
            })}
          >
            {p}
          </a>
        ),
      )}
    </div>
  );
}
export function Fields({ fields }: { fields: FieldDTO[] }) {
  return fields.length ? (
    <dl className="field-list">
      {fields.map((f, i) => (
        <div key={f.name + i}>
          <dt>{f.name}</dt>
          <dd>
            {show(f.value)}
            {f.unit && <small> {f.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <Empty>表示できる値はありません。</Empty>
  );
}
export function Publication({ run }: { run: RunDTO }) {
  const p = run.publication;
  return (
    <>
      <Badge value={p.state} />
      <small>
        原観測 {show(p.original_count)} / 派生 {show(p.derived_count)} /
        閲覧可能 {show(p.visible_count)}
      </small>
    </>
  );
}
export function infrastructureAttention(
  infra: Infrastructure | null,
  now: number,
) {
  const items: {
    id: string;
    severity: string;
    message: string;
    page: Page;
    source: null;
    run: null;
  }[] = [];
  const add = (id: string, severity: string, message: string) =>
    items.push({
      id,
      severity,
      message,
      page: "Infrastructure",
      source: null,
      run: null,
    });
  if (!infra || infra.availability === "unavailable")
    add("infra-unavailable", "unknown", "基盤情報を確認できません");
  else {
    if (infra.availability === "partial" || infrastructureStale(infra, now))
      add("infra-partial", "unknown", "基盤情報に未取得・古い結果があります");
    for (const w of infra.workers) {
      if ((w.metrics.errors ?? 0) > 0)
        add(
          w.name + "-errors",
          "warning",
          w.name + "：直近24時間の実行エラー " + w.metrics.errors,
        );
      if (w.metadata.state === "missing")
        add(w.name + "-missing", "error", w.name + "：構成を確認できません");
      if (w.exposure.workers_dev === true || w.exposure.preview_urls === true)
        add(
          w.name + "-exposure",
          "warning",
          w.name + "：公開経路を確認してください",
        );
    }
    for (const d of infra.d1) {
      if (d.metadata.state === "missing")
        add(d.name + "-missing", "error", d.name + "：構成を確認できません");
      if (
        infra.plan.value === "paid" &&
        d.metadata.storage_bytes !== null &&
        d.metadata.storage_bytes >= 8_000_000_000
      )
        add(
          d.name + "-capacity",
          "warning",
          d.name + "：保存量8 GB以上。DBごとの容量を確認してください",
        );
    }
    if (infra.r2.storage.state === "stale")
      add("r2-stale", "unknown", "R2容量の観測時刻が古くなっています");
  }
  return items;
}
export function OverviewPage({
  report,
  infra,
  now,
  allAttention = false,
}: {
  report: Report | null;
  infra: Infrastructure | null;
  now: number;
  allAttention?: boolean;
}) {
  const o = report?.overview;
  const items = [
    ...(o?.attention ?? []),
    ...infrastructureAttention(infra, now),
  ];
  if (!o)
    items.unshift({
      id: "ops-unavailable",
      severity: "unknown",
      message: "収集・公開の内部記録を取得できません",
      page: "settings",
      source: null,
      run: null,
    });
  items.sort(
    (a, b) =>
      ["error", "warning", "unknown"].indexOf(a.severity) -
        ["error", "warning", "unknown"].indexOf(b.severity) ||
      a.id.localeCompare(b.id),
  );
  const affected = new Set(items.map((i) => i.source).filter(Boolean));
  const sources = [...(o?.sources ?? [])].sort(
    (a, b) =>
      Number(affected.has(b.source_id)) - Number(affected.has(a.source_id)) ||
      Number(b.enabled) - Number(a.enabled) ||
      a.source_id.localeCompare(b.source_id),
  );
  const count = (
    n: number | null | undefined,
    total: number | null | undefined,
  ) => (n == null || total == null ? "未確認" : n + " / " + total);
  return (
    <>
      <div className="stats overview-stats" data-testid="overview-summary">
        {[
          ["収集完了", count(o?.completed, o?.expected), "Runs"],
          ["公開完了", count(o?.published, o?.expected), "Runs"],
          ["鮮度正常", count(o?.fresh, o?.checked_sources), "Sources"],
          ["要確認", String(items.length), "Overview"],
        ].map(([label, value, page]) => (
          <a
            className="stat stat-link"
            href={href(
              page as Page,
              page === "Overview"
                ? { attention: "all" }
                : {
                    as_of: report?.as_of,
                    ...(page === "Runs" && o?.logical_slot
                      ? {
                          from: o.logical_slot,
                          to: new Date(
                            Date.parse(o.logical_slot) + 59999,
                          ).toISOString(),
                        }
                      : {}),
                  },
            )}
            key={label}
          >
            <h2>{label}</h2>
            <div className="stat-value">{value}</div>
            <small>
              {label === "要確認" ? "失敗・注意・確認不能" : "対象ソース単位"}
            </small>
          </a>
        ))}
      </div>
      <p className="small muted">
        直近の予定収集枠：
        <Timestamp value={o?.logical_slot} /> · 判定取得：
        <Timestamp value={report?.fetched_at} />
      </p>
      <Panel
        title="要確認事項"
        tools={
          <a
            href={href("Overview", { attention: allAttention ? null : "all" })}
          >
            {allAttention ? "要約へ戻る" : "全件を見る (" + items.length + ")"}
          </a>
        }
      >
        {items.length ? (
          <ul className="attention-list">
            {(allAttention ? items : items.slice(0, 5)).map((item) => (
              <li key={item.id}>
                <Badge value={item.severity} />
                <a
                  href={href(item.page, { source: item.source, run: item.run })}
                >
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>現在の確認範囲で要対応事項はありません。</Empty>
        )}
      </Panel>
      <Panel
        title="ソース状況"
        tools={
          <a href={href("Sources")}>
            全ソースを見る ({sources.length || "未確認"})
          </a>
        }
      >
        <SourceTable rows={sources.slice(0, 6)} asOf={report?.as_of} compact />
      </Panel>
    </>
  );
}
export function SourceTable({
  rows,
  asOf,
  compact = false,
}: {
  rows: SourceDTO[];
  asOf?: string;
  compact?: boolean;
}) {
  return rows.length ? (
    <div
      className="table-wrap source-table-wrap"
      role="region"
      aria-label={compact ? "ソース状況一覧" : "全ソース一覧"}
      tabIndex={0}
    >
      <table className={compact ? "source-table" : "source-inventory-table"}>
        <thead>
          <tr>
            <th>Source</th>
            {!compact && <th>設定状態</th>}
            <th>直近run</th>
            <th>最新観測</th>
            <th>公開状態</th>
            {!compact && <th>詳細</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.source_id}>
              <td>
                <a href={href("Sources", { source: s.source_id })}>{s.name}</a>
                <small>
                  {s.source_id} / {s.dataset}
                </small>
              </td>
              {!compact && (
                <td>
                  {!s.adapter_available
                    ? "未導入"
                    : s.enabled
                      ? "有効"
                      : "無効"}
                  <small>
                    {s.registered ? "DB登録済み" : "DB未登録"}
                    {s.suspended ? " / 停止中" : ""}
                  </small>
                </td>
              )}
              <td>
                {s.last_run ? (
                  <a
                    href={href("Runs", {
                      run: s.last_run.run_id,
                      source: s.source_id,
                      as_of: asOf,
                    })}
                  >
                    <Badge value={s.last_run.state} />
                    <small>
                      <Timestamp value={s.last_run.scheduled_for} />
                    </small>
                  </a>
                ) : (
                  "記録なし"
                )}
              </td>
              <td>
                <Timestamp value={s.latest_observed_at} />
                <small>
                  <Badge value={s.freshness} />{" "}
                  {s.source_date && "対象日：" + s.source_date}
                </small>
              </td>
              <td>
                <Badge value={s.last_run?.publication.state} />
              </td>
              {!compact && (
                <td>
                  <Related source={s.source_id} asOf={asOf} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>ソース情報を取得できていません。</Empty>
  );
}
export function SourcesPage({ report }: { report: Report | null }) {
  return (
    <>
      <Panel title="Source inventory">
        <SourceTable rows={report?.sources ?? []} asOf={report?.as_of} />
      </Panel>
      {report?.sources?.map((s) => (
        <Panel title={s.name + " / " + s.source_id} key={s.source_id}>
          <p>{s.attribution}</p>
          <p>
            {s.source_url && (
              <a href={s.source_url} target="_blank" rel="noreferrer">
                提供元 ↗
              </a>
            )}
          </p>
          <p>取得範囲：{s.coverage.join(", ") || "未提供"}</p>
          <ul>
            {s.limitations.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p>実効条件：{s.blockers.join(", ") || "阻害条件なし"}</p>
          <Related source={s.source_id} asOf={report.as_of} />
        </Panel>
      ))}
    </>
  );
}
export function Filters({ location }: { location: Location }) {
  const dated = ["Runs", "Data"].includes(location.page);
  return (
    <form
      key={location.page + location.params.toString()}
      className="console-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget),
          next: Record<string, string> = {};
        for (const key of ["source", "dataset", "entity", "state"]) {
          const v = String(values.get(key) ?? "").trim();
          if (v) next[key] = v;
        }
        if (location.page === "Data")
          next.view = location.params.get("view") ?? "latest";
        for (const key of ["from", "to"]) {
          const v = String(values.get(key) ?? "");
          if (v)
            next[key] = new Date(
              v +
                (key === "from"
                  ? "T00:00:00.000+09:00"
                  : "T23:59:59.999+09:00"),
            ).toISOString();
        }
        window.location.hash = href(location.page, next);
      }}
    >
      <label>
        ソース
        <input
          name="source"
          placeholder="例：ecb"
          defaultValue={location.params.get("source") ?? ""}
        />
      </label>
      {location.page === "Data" && (
        <>
          <label>
            データ種別
            <select
              name="dataset"
              defaultValue={location.params.get("dataset") ?? ""}
            >
              <option value="">すべて</option>
              {[
                "fx",
                "ai_api_prices",
                "ai_model_catalog",
                "gpu_rental",
                "gpu_secondary",
                "electricity",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            項目ID
            <input
              name="entity"
              defaultValue={location.params.get("entity") ?? ""}
            />
          </label>
        </>
      )}
      {location.page === "Runs" && (
        <label>
          収集状態
          <select
            name="state"
            defaultValue={location.params.get("state") ?? ""}
          >
            <option value="">すべて</option>
            {[
              "complete",
              "pending",
              "running",
              "failed",
              "missing",
              "quarantined",
              "policy_skipped",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      )}
      {dated && (
        <>
          {(["from", "to"] as const).map((key) => (
            <label key={key}>
              {key === "from" ? "開始日" : "終了日"} (JST)
              <input
                type="date"
                name={key}
                defaultValue={
                  location.params.get(key)
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Tokyo",
                      }).format(new Date(location.params.get(key)!))
                    : ""
                }
              />
            </label>
          ))}
        </>
      )}
      <button type="submit">絞り込む</button>
      <a href={href(location.page)}>条件をクリア</a>
      {dated && <small>1回の検索は31日以内。Runsの初期範囲は直近7日。</small>}
    </form>
  );
}
export function Paging({
  report,
  location,
}: {
  report: Report | null;
  location: Location;
}) {
  return (
    <div className="paging">
      <span>
        {report?.next_cursor
          ? "続きがあります"
          : report?.state === "ready"
            ? "この条件の最終ページ"
            : "取得状態を確認してください"}
      </span>
      {report?.next_cursor && (
        <a
          className="button-link"
          href={href(location.page, {
            ...Object.fromEntries(location.params),
            cursor: report.next_cursor,
          })}
        >
          次の50件
        </a>
      )}
    </div>
  );
}
