import { useState } from "react";
import type { Report, RunDTO, DataDTO } from "./admin-contract.ts";
import type { Infrastructure } from "./infrastructure-contract.ts";
import type { Location } from "./console-router.ts";
import { href } from "./console-router.ts";
import {
  Badge,
  Timestamp,
  Panel,
  Empty,
  Related,
  Fields,
  Publication,
  Paging,
  show,
} from "./console-ui.tsx";
import { useRead } from "./use-read.ts";
import { StatusSchema, INITIAL_SLOT } from "./contracts.ts";
import { assessment, sourceChecks, scheduleLabel } from "./view-model.ts";
import { RunRecovery } from "./RunRecovery.tsx";
export function RunDetail({ run }: { run: RunDTO }) {
  return (
    <Panel title={"Run " + run.run_id}>
      {run.run_id !== run.canonical_run_id && (
        <p className="notice">
          同じ予定枠の優先記録：
          <a href={href("Runs", { run: run.canonical_run_id })}>
            実行記録を開く
          </a>
        </p>
      )}
      <div className="detail-grid">
        <Fields
          fields={[
            { name: "logical_slot", value: run.logical_slot, unit: null },
            { name: "state", value: run.state, unit: null },
            { name: "observations", value: run.observation_count, unit: null },
            { name: "accepted", value: run.accepted_count, unit: null },
            { name: "quarantined", value: run.quarantined_count, unit: null },
            { name: "error_code", value: run.error_code, unit: null },
            { name: "recovery_count", value: run.recovery_count, unit: null },
          ]}
        />
        <div>
          <p>
            開始：
            <Timestamp value={run.started_at} />
          </p>
          <p>
            終了：
            <Timestamp value={run.finished_at} />
          </p>
          <p>
            最終進捗：
            <Timestamp value={run.last_progress_at} />
          </p>
          <p>
            次回試行予定：
            <Timestamp value={run.next_attempt_at} />
          </p>
          <p>
            公開：
            <Publication run={run} />
          </p>
        </div>
      </div>
      <Related source={run.source_id} run={run.run_id} />
      <RunRecovery run={run} />
      <h3>Checkpoint</h3>
      {run.checkpoints.length ? (
        run.checkpoints.map((c) => (
          <div className="checkpoint" key={c.id}>
            <strong>{c.kind}</strong> <Badge value={c.state} /> {c.stage}
            <small>{c.id}</small>
            <Fields fields={c.counts} />
          </div>
        ))
      ) : (
        <Empty>保存されたcheckpointはありません。</Empty>
      )}
      <h3>取得試行</h3>
      {run.attempts.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>試行</th>
                <th>時刻</th>
                <th>HTTP</th>
                <th>結果</th>
                <th>所要時間</th>
              </tr>
            </thead>
            <tbody>
              {run.attempts.map((a, i) => (
                <tr key={i}>
                  <td>{a.attempt}</td>
                  <td>
                    <Timestamp value={a.started_at} />
                  </td>
                  <td>{show(a.status)}</td>
                  <td>{a.code}</td>
                  <td>{show(a.duration_ms)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>試行記録なし</Empty>
      )}
      <h3>Collection / Watchdog / Continuation・通知</h3>
      {run.invocations.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>処理種別</th>
                <th>予定・記録</th>
                <th>結果</th>
                <th>通知</th>
              </tr>
            </thead>
            <tbody>
              {run.invocations.map((i) => (
                <tr key={i.id}>
                  <td>{i.kind}</td>
                  <td>
                    <Timestamp value={i.scheduled_at} />
                    <small>
                      <Timestamp value={i.recorded_at} />
                    </small>
                  </td>
                  <td>
                    <Badge value={i.state} />
                    <small>{show(i.reason)}</small>
                  </td>
                  <td>
                    <Badge value={i.notification} />
                    <small>
                      試行 {show(i.attempts)} / 送信{" "}
                      <Timestamp value={i.sent_at} />
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          関連するsummary記録なし。未実行を断定するものではありません。
        </Empty>
      )}
      {run.details_truncated && (
        <p className="notice">表示上限に達した詳細があります。</p>
      )}
    </Panel>
  );
}
export function InitialAudit({ now }: { now: number }) {
  const state = useRead(
    "/api/status",
    (v) => StatusSchema.parse(v),
    null,
    false,
  );
  const result = assessment(state.data, now),
    seconds = Math.max(0, Math.ceil((Date.parse(INITIAL_SLOT) - now) / 1000));
  return (
    <div className="initial-body">
      <div className="initial-target">
        初回収集予定 · 固定：
        <strong>
          <Timestamp value={INITIAL_SLOT} />
        </strong>
      </div>
      <div data-testid="initial-countdown">
        {seconds ? (
          <strong role="timer">
            {[
              Math.floor(seconds / 3600),
              Math.floor((seconds % 3600) / 60),
              seconds % 60,
            ]
              .map((x) => String(x).padStart(2, "0"))
              .join(":")}
          </strong>
        ) : (
          scheduleLabel(now)
        )}
      </div>
      <p>旧判定：{result.label}</p>
      {sourceChecks(state.data).map((s) => (
        <p key={s.id}>
          {s.name}：{s.label}
        </p>
      ))}
      <p className="small muted">
        固定予定以降の公開live観測を確認する旧判定です。全件取得・証拠保存・run全体の成功を証明しません。旧参考予定は日次03:17・watchdog03:47
        JSTで、現在設定とは区別します。
      </p>
      {state.error && <p>{state.error}</p>}
    </div>
  );
}
export function RunsPage({
  report,
  location,
  now,
}: {
  report: Report | null;
  location: Location;
  now: number;
}) {
  const [initial, setInitial] = useState(location.params.has("initial"));
  const detail = location.params.has("run") || location.params.has("id");
  return (
    <>
      <Panel title="Collection runs" tools={<span>予定枠ごとの収集記録</span>}>
        {report?.runs?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source / 予定</th>
                  <th>状態</th>
                  <th>開始・終了</th>
                  <th>受入 / 隔離</th>
                  <th>公開</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((r) => (
                  <tr key={r.run_id}>
                    <td>
                      <a
                        href={href("Runs", {
                          source: r.source_id,
                          run: r.run_id,
                          as_of: report.as_of,
                        })}
                      >
                        {r.source_id}
                      </a>
                      <small>
                        <Timestamp value={r.scheduled_for} />
                      </small>
                    </td>
                    <td>
                      <Badge value={r.state} />
                      <small>{r.error_code}</small>
                    </td>
                    <td>
                      <Timestamp value={r.started_at} />
                      <small>
                        <Timestamp value={r.finished_at} />
                      </small>
                      {r.started_at && r.finished_at && (
                        <small>
                          {Math.max(
                            0,
                            Date.parse(r.finished_at) -
                              Date.parse(r.started_at),
                          ) / 1000}{" "}
                          秒
                        </small>
                      )}
                    </td>
                    <td>
                      {show(r.accepted_count)} / {show(r.quarantined_count)}
                      <small>原観測 {show(r.observation_count)}</small>
                    </td>
                    <td>
                      <Publication run={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {report?.runs
              ? "この条件の実行記録はありません。記録がないことだけで収集失敗とは判定しません。"
              : "実行記録は未取得です。取得状態を確認してください。"}
          </Empty>
        )}
        <Paging report={report} location={location} />
      </Panel>
      {detail && report?.runs?.map((r) => <RunDetail key={r.run_id} run={r} />)}
      <details
        className="panel console-panel"
        data-testid="initial-details"
        open={initial}
        onToggle={(e) => setInitial(e.currentTarget.open)}
      >
        <summary className="section-head">
          <h2>初回確認・旧判定</h2>
          <span>固定予定の履歴</span>
        </summary>
        {initial && <InitialAudit now={now} />}
      </details>
    </>
  );
}
function Values({
  row,
  published = false,
}: {
  row: DataDTO;
  published?: boolean;
}) {
  const fields = published ? row.public_fields : row.fields;
  const prices = fields.filter((f) =>
    /amount_decimal$|rate_decimal$|price_decimal$|asking_price$|shipping_price$|context_limit$|period$/.test(
      f.name,
    ),
  );
  const wanted = prices.length ? prices : fields.slice(0, 3);
  return wanted.length ? (
    <>
      {wanted.slice(0, 5).map((f) => {
        const type = fields.find(
          (x) =>
            x.name === f.name.replace(/amount_decimal$/, "") + "component_type",
        )?.value;
        return (
          <div className="price-line" key={f.name}>
            <small>{type ? String(type) : f.name}</small>
            <strong>{show(f.value)}</strong> <small>{f.unit ?? ""}</small>
          </div>
        );
      })}
    </>
  ) : (
    <span className="muted">
      {published
        ? "未公開／閲覧不可"
        : row.private_readable
          ? "未提供"
          : "閲覧条件未確認"}
    </span>
  );
}
function Trend({ data }: { data: DataDTO[] }) {
  const series = [...data].reverse();
  // Component ordering and tier conditions can change; only plot scalar FX series.
  if (series.some((d) => d.dataset !== "fx")) return null;
  const first = series
    .flatMap((d) => d.public_fields)
    .find(
      (f) =>
        /amount_decimal$|rate_decimal$|price_decimal$/.test(f.name) &&
        typeof f.value === "string" &&
        Number.isFinite(Number(f.value)),
    );
  if (
    !first ||
    series.length < 2 ||
    new Set(series.map((d) => d.source_id + "|" + d.entity_key)).size !== 1
  )
    return null;
  const points = series.map((d, i) => {
    const f = d.public_fields.find(
      (f) => f.name === first.name && f.unit === first.unit,
    );
    return f?.value !== null &&
      f?.value !== undefined &&
      Number.isFinite(Number(f.value))
      ? { i, n: Number(f.value) }
      : null;
  });
  const values = points.filter(
    (p): p is { i: number; n: number } => p !== null,
  );
  if (values.length < 2) return null;
  const min = Math.min(...values.map((p) => p.n)),
    max = Math.max(...values.map((p) => p.n));
  let path = "",
    move = true;
  for (const p of points) {
    if (!p) {
      move = true;
      continue;
    }
    path +=
      (move ? "M" : "L") +
      (15 + (p.i * 570) / (series.length - 1)) +
      "," +
      (85 - ((p.n - min) * 60) / (max - min || 1));
    move = false;
  }
  return (
    <figure className="trend">
      <svg
        role="img"
        aria-label="表示中の履歴の推移。欠測箇所は線を分断。"
        viewBox="0 0 600 100"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <figcaption>
        表示中ページの公開値の推移：{first.name} {first.unit}
        。正確な小数は表を参照。
      </figcaption>
    </figure>
  );
}
export function DataDetail({ row }: { row: DataDTO }) {
  return (
    <Panel title={row.entity_key}>
      <p>
        {row.source_id} / {row.dataset} / {row.quality} / {row.data_origin}
        {row.derived ? " / 派生値" : ""}
      </p>
      <div className="detail-grid">
        <div>
          <h3>取得・正規化値</h3>
          <Fields fields={row.fields} />
          {row.private_blocker && <p>{row.private_blocker}</p>}
        </div>
        <div>
          <h3>現在閲覧可能な公開値</h3>
          <Fields fields={row.public_fields} />
        </div>
      </div>
      <p>
        観測：
        <Timestamp value={row.observed_at} /> · 保存：
        <Timestamp value={row.recorded_at} />
      </p>
      <p>
        公開：
        <Timestamp value={row.publication.completed_at} /> · 対象日・期間：
        {show(row.source_period)}
      </p>
      <p>
        保持期限：
        <Timestamp value={row.retention_until} /> · policy：{row.policy_version}
      </p>
      <p>品質：{row.issues.join(", ") || "記録された注意なし"}</p>
      <Related source={row.source_id} run={row.run_id} />
      <p>
        <a
          href={href("Data", {
            source: row.source_id,
            dataset: row.dataset,
            entity: row.entity_key,
            view: "history",
          })}
        >
          この項目の履歴を見る
        </a>
      </p>
      {row.previous_fields.length > 0 && (
        <details>
          <summary>前回値との比較</summary>
          <div className="detail-grid">
            <div>
              <h3>前回</h3>
              <Fields fields={row.previous_fields} />
            </div>
            <div>
              <h3>今回</h3>
              <Fields fields={row.fields} />
            </div>
          </div>
        </details>
      )}
      {row.related_ids.length > 0 && (
        <p>
          訂正・系譜：
          {row.related_ids.map((id) => (
            <a className="record-link" href={href("Data", { id })} key={id}>
              {id.slice(0, 16)}…
            </a>
          ))}
        </p>
      )}
      <p>{row.attribution}</p>
      {row.source_url && (
        <a href={row.source_url} target="_blank" rel="noreferrer">
          出典 ↗
        </a>
      )}
      <ul>
        {row.conditions.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      {row.license_notice && (
        <details>
          <summary>ライセンス全文</summary>
          <pre className="license">{row.license_notice}</pre>
        </details>
      )}
      <details>
        <summary>表示用JSON・元のUTC時刻</summary>
        <pre>{JSON.stringify(row, null, 2)}</pre>
      </details>
    </Panel>
  );
}
export function DataPage({
  report,
  location,
}: {
  report: Report | null;
  location: Location;
}) {
  const view = location.params.get("view") ?? "latest",
    data = report?.data ?? [];
  const dataset =
    location.params.get("dataset") ??
    (new Set(data.map((r) => r.dataset)).size === 1 ? data[0]?.dataset : "");
  const heading = dataset?.startsWith("ai_")
    ? "モデル / provider"
    : dataset?.startsWith("gpu_")
      ? "機種 / 地域・商品条件"
      : dataset === "electricity"
        ? "地域 / 対象期間"
        : "項目 / 種別";
  const notices = [...new Map(data.map((r) => [r.source_id, r])).values()];
  return (
    <>
      <nav className="tabs" aria-label="データ表示">
        {[
          ["latest", "最新"],
          ["history", "履歴"],
          ["quality", "品質・隔離"],
          ["changes", "差分・訂正"],
        ].map(([v, label]) => (
          <a
            key={v}
            aria-current={view === v ? "page" : undefined}
            href={href("Data", {
              ...Object.fromEntries(location.params),
              view: v,
              cursor: null,
              id: null,
              as_of: null,
            })}
          >
            {label}
          </a>
        ))}
      </nav>
      <details className="panel console-panel">
        <summary className="section-head">公開データ件数</summary>
        <div className="panel-content">
          <p>
            現在の権利で閲覧できる全保持履歴の件数です。ソース・種類を反映し、検索期間・表示ページの件数とは区別します。
          </p>
          {report?.datasets ? (
            report.datasets.length ? (
              <ul>
                {report.datasets.map((d) => (
                  <li key={d.dataset}>
                    {d.dataset}：{show(d.visible_count)} 件 · 最新観測{" "}
                    <Timestamp value={d.latest_observed_at} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>閲覧可能な公開記録はありません。</Empty>
            )
          ) : (
            <Empty>公開件数は未取得です。</Empty>
          )}
        </div>
      </details>
      <Panel
        title={
          view === "latest"
            ? "最新の完全なsnapshot・最新観測"
            : "データ " + view
        }
      >
        {report?.state === "not_supported" ? (
          <Empty>
            このデータ種別は現在のCollectorに未導入です。取得済み0件や収集失敗とは区別します。
          </Empty>
        ) : !report?.data ? (
          <Empty>観測レコードは未取得です。取得状態を確認してください。</Empty>
        ) : !data.length ? (
          <Empty>この条件で表示できる記録はありません。</Empty>
        ) : (
          <>
            {view === "history" && <Trend data={data} />}
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{heading}</th>
                    <th>取得値・条件</th>
                    <th>公開値</th>
                    <th>対象日・観測</th>
                    <th>品質 / 公開</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.observation_id}>
                      <td>
                        <a
                          href={href("Data", {
                            source: r.source_id,
                            dataset: r.dataset,
                            id: r.observation_id,
                            as_of: report?.as_of,
                          })}
                        >
                          {r.entity_key}
                        </a>
                        <small>
                          {r.source_id} / {r.dataset}
                        </small>
                        <DataConditions row={r} />
                        {r.derived && <small>派生値</small>}
                      </td>
                      <td>
                        <Values row={r} />
                      </td>
                      <td>
                        <Values row={r} published />
                      </td>
                      <td>
                        {show(r.source_period)}
                        <small>
                          <Timestamp value={r.observed_at} />
                        </small>
                      </td>
                      <td>
                        <Badge value={r.quality} />
                        <small>
                          <Badge value={r.publication.state} />
                        </small>
                        {r.data_origin !== "live" && (
                          <small>{r.data_origin}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Paging report={report} location={location} />
        <p className="small muted">
          件数は表示中ページの記録数です。価格0は無料利用の確認を意味しません。通貨・単位・条件を維持し、自動換算は行いません。
        </p>
      </Panel>
      {location.params.has("id") &&
        data.map((r) => <DataDetail key={r.observation_id} row={r} />)}
      {!location.params.has("id") &&
        notices.map((r) => (
          <details className="panel console-panel" key={r.source_id}>
            <summary className="section-head">
              {r.source_id} — 出典・利用条件
            </summary>
            <div className="panel-content">
              <p>{r.attribution}</p>
              {r.source_url && (
                <a href={r.source_url} target="_blank" rel="noreferrer">
                  出典 ↗
                </a>
              )}
              <ul>
                {r.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {r.license_notice && <pre>{r.license_notice}</pre>}
              <a href={href("Rights", { source: r.source_id })}>権利の詳細</a>
            </div>
          </details>
        ))}
    </>
  );
}
function DataConditions({ row }: { row: DataDTO }) {
  const names = row.dataset.startsWith("gpu_")
    ? [
        "accelerator_model",
        "region",
        "contract_type",
        "billing_unit",
        "condition",
        "sale_unit",
        "gpu_count_in_lot",
        "listing_format",
      ]
    : row.dataset === "electricity"
      ? ["area", "region", "sector", "period", "rate_unit", "unit"]
      : row.dataset.startsWith("ai_")
        ? ["serving_provider", "model_id", "pricing_scope"]
        : ["reference_rate_type"];
  const fields = row.private_readable ? row.fields : row.public_fields;
  return (
    <>
      {names.map((name) => {
        const value = fields.find((f) => f.name === name)?.value;
        return value == null ? null : (
          <small key={name}>
            {name}: {show(value)}
          </small>
        );
      })}
    </>
  );
}
const rightLabels: Record<string, string> = {
  automated_collection: "自動収集",
  private_storage: "内部保存",
  internal_analysis: "内部分析",
  external_llm_processing: "外部LLM",
  public_display: "公開表示",
  raw_redistribution: "原データ再配布",
  normalized_redistribution: "正規化値再配布",
  derived_redistribution: "派生値再配布",
  commercial_redistribution: "商用再配布",
};
export function RightsPage({ report }: { report: Report | null }) {
  const policies = report?.policies ?? [];
  return (
    <>
      <Panel title="ソース × 利用目的">
        <div className="table-wrap">
          <table className="rights-table">
            <thead>
              <tr>
                <th>Source / policy</th>
                {Object.values(rightLabels).map((x) => (
                  <th key={x}>{x}</th>
                ))}
                <th>期限</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.source_id + p.version}>
                  <td>
                    {p.source_id}
                    <small>{p.version}</small>
                    <Badge value={p.current ? "current" : "history"} />
                  </td>
                  {Object.keys(rightLabels).map((k) => (
                    <td key={k}>
                      <Badge value={p.rights[k]} />
                    </td>
                  ))}
                  <td>
                    <Badge value={p.expiry} />
                    <small>
                      <Timestamp value={p.valid_until} />
                    </small>
                    {p.days_remaining !== null && (
                      <small>残り {p.days_remaining} 日</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!policies.length && <Empty />}
      </Panel>
      {policies.map((p, index) => {
        const prior = policies
          .slice(index + 1)
          .find((x) => x.source_id === p.source_id);
        const changed = prior
          ? [
              ...Object.keys(rightLabels).filter(
                (k) => prior.rights[k] !== p.rights[k],
              ),
              ...(
                ["valid_from", "valid_until", "fields", "conditions"] as const
              ).filter(
                (k) => JSON.stringify(prior[k]) !== JSON.stringify(p[k]),
              ),
            ]
          : [];
        return (
          <details
            className="panel console-panel"
            key={p.source_id + p.version}
          >
            <summary className="section-head">
              {p.source_id} / {p.version} — 条件・根拠・保持
            </summary>
            <div className="panel-content">
              <p>
                現行条件で収集：{p.collection_allowed ? "可能" : "停止／対象外"}{" "}
                · 公開：{p.publication_allowed ? "可能" : "停止／対象外"}
              </p>
              <p>{p.blockers.join(", ") || "阻害条件なし"}</p>
              <p>
                適用開始：
                <Timestamp value={p.valid_from} /> · 根拠確認：
                <Timestamp value={p.checked_at} />
              </p>
              <p>許可対象：{p.fields.join(", ")}</p>
              <p>
                前版との差分：
                {prior
                  ? changed.join(", ") || "比較対象項目に差分なし"
                  : "比較できる前版なし"}
              </p>
              <Fields fields={p.retention} />
              <ul>
                {p.conditions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <p>根拠：{p.evidence_refs.join(" / ")}</p>
              <p>{p.attribution}</p>
              {p.license_url && (
                <a href={p.license_url} target="_blank" rel="noreferrer">
                  ライセンスの提供元 ↗
                </a>
              )}
              {p.license_notice && (
                <pre className="license">{p.license_notice}</pre>
              )}
              <Related source={p.source_id} />
            </div>
          </details>
        );
      })}
    </>
  );
}
export function ReleasesPage({
  report,
  infra,
  location,
}: {
  report: Report | null;
  infra: Infrastructure | null;
  location: Location;
}) {
  const records = report?.releases?.records ?? [];
  return (
    <>
      <Panel title="本番の稼働version">
        <div className="release-grid">
          {infra?.workers.map((w) => (
            <section key={w.name}>
              <h3>{w.name}</h3>
              {w.deployment.versions?.length ? (
                w.deployment.versions.map((v) => {
                  const record = records.find(
                    (r) => r.worker === w.name && r.version_id === v.id,
                  );
                  return (
                    <div key={v.id}>
                      <p className="mono">{v.id}</p>
                      <p>配信 {v.percentage}%</p>
                      <p>Git SHA：{record ? record.git_sha : "未照合"}</p>
                      {record?.github_url && (
                        <a
                          href={record.github_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          GitHubで確認 ↗
                        </a>
                      )}
                    </div>
                  );
                })
              ) : (
                <Empty>配信version未取得</Empty>
              )}
              <Timestamp value={w.deployment.created_at} />
            </section>
          )) ?? <Empty>Cloudflareの稼働情報を取得できません。</Empty>}
        </div>
        <p className="small muted">
          versionと台帳が一致する記録だけを対応づけます。履歴の配信割合は当時の記録です。
        </p>
      </Panel>
      <Panel title="配信履歴">
        {!report?.releases?.ledger_available && (
          <p className="notice">
            配信台帳を参照できません。未適用・接続状態を確認してください。
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>時刻 / Worker</th>
                <th>イベント / version</th>
                <th>Commit</th>
                <th>検証</th>
                <th>根拠</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.record_id}>
                  <td>
                    <Timestamp value={r.recorded_at} />
                    <small>{r.worker}</small>
                  </td>
                  <td>
                    {r.event}
                    <small>{r.version_id}</small>
                  </td>
                  <td>
                    {r.github_url ? (
                      <a href={r.github_url} target="_blank" rel="noreferrer">
                        {r.git_sha.slice(0, 12)}
                      </a>
                    ) : (
                      r.git_sha.slice(0, 12)
                    )}
                    <small>tree {r.tree_sha.slice(0, 12)}</small>
                  </td>
                  <td>
                    {Object.entries(r.checks).map(([k, v]) => (
                      <small key={k}>
                        {k}: {v}
                      </small>
                    ))}
                  </td>
                  <td>
                    <details>
                      <summary>証跡</summary>
                      <p>{r.evidence_ref}</p>
                      <p className="mono">{r.evidence_sha256}</p>
                      <p>artifact {r.artifact_sha256}</p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paging report={report} location={location} />
      </Panel>
      <Panel title="DB migration適用記録">
        {report?.releases?.migrations.length ? (
          <ul>
            {report.releases.migrations.map((m) => (
              <li key={m.database + m.name}>
                {m.database} / {m.name} — {show(m.applied_at)}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Panel>
    </>
  );
}
export function SettingsPage({
  report,
  infra,
}: {
  report: Report | null;
  infra: Infrastructure | null;
}) {
  const runtime = report?.settings?.find((s) => s.source_id === null);
  const crons = runtime?.runtime
    .filter((f) => f.name.endsWith("_cron"))
    .map((f) => String(f.value))
    .sort();
  const platform = infra?.workers.find(
    (w) => w.name === "ai-investment-collector",
  )?.schedules;
  return (
    <>
      <Panel title="実効設定とCloudflare設定">
        <p>
          Collector Cron照合：
          {crons && platform?.state === "ok" && platform.crons
            ? JSON.stringify(crons) ===
              JSON.stringify([...platform.crons].sort())
              ? "一致"
              : "差分あり"
            : "未確認"}
        </p>
        <p>CloudflareのCron：{platform?.crons?.join(" / ") ?? "未取得"}</p>
        <a href={href("Infrastructure")}>Cloudflare設定の詳細</a>
        <p className="small muted">
          認証情報は設定有無のみです。設定済みでも接続成功や権利の許可を意味しません。
        </p>
      </Panel>
      {report?.settings?.map((s) => (
        <Panel title={s.name} key={s.source_id ?? "runtime"}>
          <p>
            runtimeとDB：
            {s.matches === null
              ? "照合対象なし／未確認"
              : s.matches
                ? "一致"
                : "差分あり"}
          </p>
          <div className="detail-grid">
            <div>
              <h3>実行中Collectorの設定</h3>
              <Fields fields={s.runtime} />
            </div>
            <div>
              <h3>DB登録内容</h3>
              <Fields fields={s.stored} />
            </div>
          </div>
          <p>{s.blockers.join(", ") || "記録された阻害条件なし"}</p>
          {s.source_id && <Related source={s.source_id} />}
        </Panel>
      ))}
    </>
  );
}
export function Diagnostics() {
  const status = useRead(
      "/api/status",
      (v) => StatusSchema.parse(v),
      null,
      false,
    ),
    [copied, setCopied] = useState("");
  const diagnostics = status.data
    ? Object.fromEntries(
        Object.entries(status.data.endpoints).map(([name, e]) => [
          name,
          {
            state: e.state,
            http_status: e.http_status,
            checked_at: e.checked_at,
            error_kind: e.error_kind,
            retry_at: e.retry_at,
          },
        ]),
      )
    : null;
  return (
    <div className="panel-content">
      <p>公開APIの接続結果です。観測値のJSONはDataの詳細で確認できます。</p>
      <button
        onClick={() => {
          void navigator.clipboard
            .writeText(JSON.stringify(diagnostics, null, 2))
            .then(
              () => setCopied("コピーしました"),
              () => setCopied("コピーできませんでした"),
            );
        }}
        disabled={!diagnostics}
      >
        診断情報をコピー
      </button>
      <span role="status">{copied}</span>
      <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
      {status.error && <p>{status.error}</p>}
    </div>
  );
}
