import { useState } from "react";
import type { ReactNode } from "react";
import { ENDPOINTS, INITIAL_SLOT, UPSTREAM } from "./contracts.ts";
import type { Status, EndpointKey, FX, AI } from "./contracts.ts";
import type { PollState } from "./poller.ts";
import {
  apiLabel,
  assessment,
  collectionLabel,
  display,
  freshnessLabel,
  jst,
  observations,
  publicDataLabel,
  scheduleLabel,
  sourceChecks,
} from "./view-model.ts";

const Badge = ({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) => <span className={"badge " + tone}>{children}</span>;
function Time({ value }: { value: string | null | undefined }) {
  return value ? (
    <time dateTime={value} title={new Date(value).toISOString()}>
      {jst(value)}
    </time>
  ) : (
    <span className="muted">未提供</span>
  );
}
function Card({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note: ReactNode;
}) {
  return (
    <section className="stat">
      <h2>{label}</h2>
      <div className="stat-value">{children}</div>
      <div className="stat-note">{note}</div>
    </section>
  );
}
const labels: Record<string, string> = {
  input: "入力",
  output: "出力",
  cache_read: "キャッシュ読込",
  cache_write: "キャッシュ書込",
  reasoning: "推論",
  input_audio: "音声入力",
  output_audio: "音声出力",
  request: "リクエスト",
};
const units: Record<string, string> = {
  million_tokens: "100万トークンあたり",
  token: "1トークンあたり",
  request: "1リクエストあたり",
};
function Failure({
  report,
  name,
}: {
  report: Status | null;
  name: EndpointKey;
}) {
  const result = report?.endpoints[name];
  if (!result) return <p className="empty">未取得・現在確認できません。</p>;
  if (result.state === "error")
    return (
      <p className="error-text" role="status">
        取得エラー：{result.issue}
        {result.retry_at && (
          <>
            。次回取得可能時刻：
            <Time value={result.retry_at} />
          </>
        )}
      </p>
    );
  return null;
}
function SourceMetadata({ report }: { report: Status | null }) {
  return (
    <>
      <Failure report={report} name="sources" />
      {report?.endpoints.sources.data?.data.length === 0 && (
        <p className="muted">
          公開ソース情報はまだありません。Collector全体の設定や有効・無効を示す一覧ではありません。
        </p>
      )}
      {report?.endpoints.sources.data?.data.map((source) => (
        <section className="attribution" key={source.source_id}>
          <h3>
            {source.operator}{" "}
            <span className="muted small">({source.source_id})</span>
          </h3>
          <p>{source.attribution}</p>
          <p>
            <a href={source.source_url} target="_blank" rel="noreferrer">
              出典を開く ↗
            </a>
            {source.license_url && (
              <>
                {" "}
                ·{" "}
                <a href={source.license_url} target="_blank" rel="noreferrer">
                  利用条件・ライセンス ↗
                </a>
              </>
            )}
          </p>
          <p className="small">
            取得範囲：{source.coverage.join(" / ") || "未提供"}
          </p>
          <ul className="small">
            {[...source.conditions, ...source.limitations].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ))}
      {observations(report)
        .filter(
          (o, i, all) =>
            all.findIndex(
              (x) =>
                x.attribution === o.attribution &&
                x.reuse.notice === o.reuse.notice,
            ) === i,
        )
        .map((o) => (
          <section className="attribution" key={o.observation_id}>
            <h3>観測に付随する出典・条件：{o.source.source_id}</h3>
            <p>{o.attribution}</p>
            <a href={o.source.source_url} target="_blank" rel="noreferrer">
              観測の出典 ↗
            </a>
            <ul className="small">
              {o.reuse.conditions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {o.reuse.notice && <pre className="license">{o.reuse.notice}</pre>}
          </section>
        ))}
      <Failure report={report} name="licenses" />
      {report?.endpoints.licenses.data && (
        <details>
          <summary>Models.dev MITライセンス全文（API提供）</summary>
          <pre className="license">
            {report.endpoints.licenses.data.models_dev_mit}
          </pre>
        </details>
      )}
    </>
  );
}

type PriceComponent = NonNullable<AI["value"]["price_components"]>[number];
function PriceValues({ values }: { values: PriceComponent[] }) {
  if (!values.length) return <>未提供</>;
  if (values.length === 1) return <>{display(values[0].amount_decimal)}</>;
  return (
    <div className="price-stack">
      {values.map((c, i) => (
        <span key={i} title={c.tier_conditions ?? "条件：未提供"}>
          {display(c.amount_decimal)} <small>条件{i + 1}</small>
        </span>
      ))}
    </div>
  );
}
function PriceUnit({ components }: { components: PriceComponent[] }) {
  const relevant = components.filter(
    (c) => c.component_type === "input" || c.component_type === "output",
  );
  const unitText = (c: PriceComponent) =>
    display(c.currency) +
    " / " +
    (c.unit ? (units[c.unit] ?? c.unit) : "未提供");
  const distinct = [...new Set(relevant.map(unitText))];
  if (distinct.length < 2) return <>{distinct[0] ?? "未提供"}</>;
  // Different units stay attached to their components; never merge or convert prices.
  return (
    <>
      {[
        ...new Set(
          relevant.map(
            (c) =>
              (labels[c.component_type!] ?? c.component_type) +
              "：" +
              unitText(c),
          ),
        ),
      ].map((line) => (
        <small key={line}>{line}</small>
      ))}
    </>
  );
}
function Countdown({ now }: { now: number }) {
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(INITIAL_SLOT) - now) / 1000),
  );
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return (
    <div className="countdown" data-testid="initial-countdown">
      <span className="muted">
        {seconds ? "初回予定まで" : "固定した初回予定"}
      </span>
      {seconds ? (
        <strong role="timer">
          {[hours, minutes, rest]
            .map((n) => String(n).padStart(2, "0"))
            .join(":")}
        </strong>
      ) : (
        <strong className="elapsed">{scheduleLabel(now)}</strong>
      )}
    </div>
  );
}
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="hint">
      <summary aria-label={label} title={label}>
        i
      </summary>
      <div className="hint-content">{children}</div>
    </details>
  );
}
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    Overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    Sources: (
      <>
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M12 7v5M5 17v-5h14v5" />
      </>
    ),
    API: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16" />
      </>
    ),
    Data: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
      </>
    ),
    Logs: (
      <>
        <path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" />
      </>
    ),
    Settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Dashboard({
  state,
  now,
  refresh,
  setAuto,
}: {
  state: PollState;
  now: number;
  refresh: () => void;
  setAuto: (value: boolean) => void;
}) {
  const report = state.report,
    rows = observations(report),
    health = report?.endpoints.health.data;
  const fx = rows.filter(
    (o): o is FX => o.dataset === "fx" && o.source.source_id === "ecb",
  );
  const ai = rows.filter(
    (o): o is AI =>
      o.dataset === "ai_api_prices" && o.source.source_id === "models_dev",
  );
  const checks = sourceChecks(report);
  const result = assessment(report, now);
  const waiting = now < state.nextAllowedAt;
  const [copied, setCopied] = useState("");
  async function copy() {
    const diagnostic = JSON.stringify(
      {
        app: "AI Investment Research Admin",
        initial_slot: INITIAL_SLOT,
        browser_time: new Date(now).toISOString(),
        attempted_at: state.attemptedAt,
        received_at: state.receivedAt,
        error: state.error,
        report,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(diagnostic);
      setCopied("コピーしました");
    } catch {
      setCopied(
        "コピーできませんでした。Raw JSON欄を開き、必要な応答を選択してコピーしてください。",
      );
    }
  }
  const verdict = state.busy && !report ? "公開APIを確認中" : result.label;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#overview">
        Overviewへ移動
      </a>
      <aside className="sidebar" aria-label="管理メニュー">
        <div className="sidebar-brand">
          <span className="brand-mark">AI</span>
          <div>
            Investment Research<small>PERSONAL CONSOLE</small>
          </div>
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">IR</span>
          <div>
            Personal workspace<small>公開APIの収集状況</small>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="メインナビゲーション">
          <a className="nav-item active" href="#overview" aria-current="page">
            <NavIcon name="Overview" />
            <span>Overview</span>
          </a>
          {["Sources", "API", "Data", "Logs", "Settings"].map((name) => (
            <button
              className="nav-item"
              key={name}
              disabled
              title="Coming later — 未実装"
            >
              <NavIcon name={name} />
              <span>{name}</span>
              <small>Later</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small-label">PUBLIC API ONLY</span>
          <p>読み取り専用の管理画面</p>
          <small>設定変更・収集操作は行いません。</small>
          <div className="sidebar-domain">api.ai-investment-research.net</div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            AI Investment Research <Badge>読み取り専用</Badge>
          </div>
          <div className="topbar-controls">
            <div
              className="last-refresh"
              title={
                state.error
                  ? "前回受信時刻・現在の内容は未検証"
                  : "この画面が応答を受信した時刻"
              }
            >
              <span>最終画面更新</span>
              <Time value={state.receivedAt} />
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={state.auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              <span>
                自動更新 <strong>{state.auto ? "ON" : "OFF"}</strong>
              </span>
            </label>
            <button
              className="primary"
              onClick={refresh}
              disabled={state.busy || waiting}
              title="公開APIを読み直します。Collectorは実行しません。"
            >
              {state.busy ? "取得中…" : "今すぐ更新"}
            </button>
          </div>
        </header>
        <main id="overview">
          <div className="overview-heading">
            <div>
              <p className="breadcrumb">
                Workspace <span>/</span> Overview
              </p>
              <h1>
                Overview <span>収集状況</span>
              </h1>
            </div>
            <div className="overview-meta">
              <span
                className={"pulse " + (state.auto && !state.hidden ? "on" : "")}
              />
              {!state.auto
                ? "手動更新のみ"
                : state.hidden
                  ? "非表示中は自動取得を停止"
                  : "60秒ごとに公開APIを確認"}
              <Hint label="この画面の確認範囲">
                <p>
                  公開APIから確認できる範囲だけを表示します。更新はAPIの読み直しで、収集は実行しません。この画面を閉じている間は監視しません。
                </p>
                <p>
                  private側の失敗理由、R2保存結果、Cloudflareの現在のCron設定は確認できません。
                </p>
              </Hint>
            </div>
          </div>
          <div className="refresh-status" aria-live="polite">
            {state.busy ? (
              "表示を更新中：表示中の値は直前の取得結果です。"
            ) : waiting ? (
              <>
                再取得可能：
                <Time value={new Date(state.nextAllowedAt).toISOString()} />
                （連打制限・Retry-Afterを反映）
              </>
            ) : (
              "公開APIの参照のみ。収集・設定の操作は行いません。"
            )}
          </div>
          {state.error && (
            <p className="notice error-text" role="alert">
              {state.error}。前回の観測値は表示していません。
            </p>
          )}
          <div className="stats" aria-live="polite">
            <Card label="API応答" note="固定エンドポイントの取得結果">
              {state.busy && !report ? "取得中…" : apiLabel(report)}
            </Card>
            <Card
              label="Collectorの最終処理記録"
              note={
                health
                  ? collectionLabel(health.collector)
                  : "healthを現在確認できません"
              }
            >
              <Time value={health?.collector.last_collector_completed_at} />
            </Card>
            <Card label="公開データ" note="公開APIの現在の応答">
              {publicDataLabel(report)}
            </Card>
            <Card label="初回収集判定" note="対象：ECB / Models.dev">
              <span
                className={"verdict " + (report ? result.tone : "neutral")}
                data-testid="initial-verdict"
              >
                {verdict}
              </span>
            </Card>
          </div>
          <div className="overview-row status-row">
            <section
              className="panel initial-panel"
              aria-labelledby="initial-heading"
            >
              <div className="section-head">
                <h2 id="initial-heading">初回確認</h2>
                <Hint label="初回確認の判定・予定について">
                  <p>
                    各ソースで初回予定以降のlive観測が1件以上あれば確認済みです。全モデル・全項目の完全取得、R2保存、パイプライン全体の監査を意味しません。
                  </p>
                  <p>
                    日次Cron・watchdogは設定に基づく参考予定です。Cloudflareの現在の設定を確認した結果ではありません。
                  </p>
                  <p>
                    Collectorの処理時刻はwatchdogや補助処理でも更新され得ます。この値だけでは各ソースの成功と判定しません。
                  </p>
                </Hint>
              </div>
              <div className="initial-body">
                <div className="initial-target">
                  <span className="small-label">初回収集予定 · 固定</span>
                  <strong>
                    <Time value={INITIAL_SLOT} />
                  </strong>
                </div>
                <Countdown now={now} />
                <dl className="schedule">
                  <div>
                    <dt>
                      日次Cron <span className="muted">予定</span>
                    </dt>
                    <dd>
                      毎日 <strong>03:17</strong> JST
                    </dd>
                  </div>
                  <div>
                    <dt>
                      watchdog <span className="muted">予定</span>
                    </dt>
                    <dd>
                      毎日 <strong>03:47</strong> JST
                    </dd>
                  </div>
                </dl>
                <div className="initial-result">
                  <span className="small-label">初回確認判定</span>
                  <Badge tone={report ? result.tone : "neutral"}>
                    {verdict}
                  </Badge>
                </div>
                {now >= Date.parse(INITIAL_SLOT) + 15 * 60000 &&
                  checks.some((s) => !s.confirmed) &&
                  report &&
                  report.endpoints.latest.state !== "error" && (
                    <p className="warning-text small">
                      未確認のソースあり。収集失敗や原因を断定するものではありません。
                    </p>
                  )}
              </div>
            </section>
            <section
              className="panel sources-panel"
              aria-labelledby="sources-heading"
            >
              <div className="section-head">
                <h2 id="sources-heading">Source Status</h2>
                <div className="heading-tools">
                  <span className="small muted">2 sources</span>
                  <Hint label="ソース判定と鮮度について">
                    <p>
                      判定はsource_idとobserved_atに基づきます。ECBのsource_dateは元データの日付で、今回の取得時刻とは別です。
                    </p>
                    <p>
                      ソース情報に掲載がないだけで無効化と断定しません。APIの鮮度情報・注意事項は各ソースの補足で確認できます。
                    </p>
                  </Hint>
                </div>
              </div>
              <div className="table-wrap">
                <table className="source-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>状態</th>
                      <th>
                        observed_at <small>JST</small>
                      </th>
                      <th>初回予定以降</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                          <small className="mono">{s.id}</small>
                        </td>
                        <td>
                          <Badge tone={report ? s.tone : "neutral"}>
                            {!report && !state.error ? "まだ未確認" : s.label}
                          </Badge>
                          {s.rows.length > 0 && (
                            <details className="source-notes">
                              <summary>
                                {s.rows.some((o) => o.stale)
                                  ? "鮮度注意あり"
                                  : "鮮度・注意事項"}
                              </summary>
                              {[...new Set(s.rows.map(freshnessLabel))].map(
                                (v, i) => (
                                  <p key={i}>{v}</p>
                                ),
                              )}
                            </details>
                          )}
                        </td>
                        <td>
                          <Time value={s.latest} />
                        </td>
                        <td>
                          {s.confirmed ? (
                            <span className="success-text">確認済み</span>
                          ) : report?.endpoints.latest.state === "error" ||
                            state.error ? (
                            "判定できない"
                          ) : (
                            "未確認"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Failure report={report} name="latest" />
              {report?.endpoints.latest.data?.data.some(
                (o) => o.data_origin !== "live",
              ) && (
                <p className="warning-text panel-note">
                  合成データは実観測判定・価格表から除外しています。
                </p>
              )}
              <div className="panel-note">
                公開観測の確認結果です。Collector全体の設定一覧ではありません。
              </div>
            </section>
          </div>
          <div className="overview-row data-row">
            <section className="panel fx-panel" aria-labelledby="fx-heading">
              <div className="section-head">
                <h2 id="fx-heading">
                  FX <span>為替参照値</span>
                </h2>
                <div className="heading-tools">
                  <span className="small muted">ECB · {fx.length} 観測</span>
                  <Hint label="FX値の読み方">
                    <p>
                      為替値はAPIのdecimal文字列をそのまま表示します。1
                      base_currencyあたりのquote_currencyです。
                    </p>
                    <p>
                      「計算値」はAPIがECB統計から算出した値で、ECB公表クロスではありません。source_dateとobserved_atを区別してください。
                    </p>
                  </Hint>
                </div>
              </div>
              {fx.length ? (
                <div className="table-wrap data-scroll">
                  <table className="fx-table">
                    <thead>
                      <tr>
                        <th>通貨ペア</th>
                        <th>為替値</th>
                        <th>source_date</th>
                        <th>
                          observed_at <small>JST</small>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fx.map((o) => (
                        <tr key={o.observation_id}>
                          <td>
                            <strong className="mono">
                              {display(o.value.base_currency)}/
                              {display(o.value.quote_currency)}
                            </strong>
                            <small>
                              {o.value.reference_rate_type ===
                              "project_calculation"
                                ? "API計算値"
                                : o.value.reference_rate_type ===
                                    "ECB_reference"
                                  ? "ECB参照値"
                                  : "参照種別：未提供"}
                            </small>
                          </td>
                          <td className="number">
                            {display(o.value.rate_decimal)}
                          </td>
                          <td className="mono">{display(o.source_date)}</td>
                          <td>
                            <Time value={o.observed_at} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <span className="empty-symbol" aria-hidden="true">
                    —
                  </span>
                  <div>
                    <strong>
                      {report?.endpoints.latest.state === "error" || !report
                        ? "現在確認できません"
                        : "公開観測はまだありません"}
                    </strong>
                    <small>
                      EUR/USD・EUR/JPYなど、APIが返した観測値を表示します。
                    </small>
                  </div>
                </div>
              )}
              <div className="panel-note">
                元データ日付と観測時刻を区別 · nullは未提供として表示
              </div>
            </section>
            <section className="panel ai-panel" aria-labelledby="ai-heading">
              <div className="section-head">
                <h2 id="ai-heading">AI API Prices</h2>
                <div className="heading-tools">
                  <span className="small muted">
                    Models.dev · {ai.length} 観測
                  </span>
                  <Hint label="AI API価格の比較条件">
                    <p>
                      Models.devの選定モデルだけを示す二次カタログです。メーカー確認済みの一次価格ではありません。
                    </p>
                    <p>
                      異なる通貨・課金単位を合算せず、そのまま表示します。入力・出力以外の価格区分、条件、税・補足は「全価格区分・条件」で確認できます。
                    </p>
                  </Hint>
                </div>
              </div>
              {ai.length ? (
                <>
                  <div className="table-wrap data-scroll">
                    <table className="ai-table">
                      <thead>
                        <tr>
                          <th>model / provider</th>
                          <th>input</th>
                          <th>output</th>
                          <th>通貨 / unit</th>
                          <th>
                            observed_at <small>JST</small>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ai.map((o) => {
                          const components = o.value.price_components ?? [];
                          return (
                            <tr key={o.observation_id}>
                              <td>
                                <strong className="model-name">
                                  {display(o.value.model_id)}
                                </strong>
                                <small>
                                  {display(o.value.serving_provider)}
                                </small>
                              </td>
                              <td className="number">
                                <PriceValues
                                  values={components.filter(
                                    (c) => c.component_type === "input",
                                  )}
                                />
                              </td>
                              <td className="number">
                                <PriceValues
                                  values={components.filter(
                                    (c) => c.component_type === "output",
                                  )}
                                />
                              </td>
                              <td className="unit-cell">
                                <PriceUnit components={components} />
                              </td>
                              <td>
                                <Time value={o.observed_at} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <details className="price-detail">
                    <summary>全価格区分・条件</summary>
                    {ai.map((o) => (
                      <section key={o.observation_id}>
                        <h3>{display(o.value.model_id)}</h3>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>区分</th>
                                <th>金額</th>
                                <th>通貨 / 単位</th>
                                <th>条件 / cache TTL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.value.price_components?.length
                                ? o.value.price_components
                                : [null]
                              ).map((c, i) => (
                                <tr key={i}>
                                  <td>
                                    {c?.component_type
                                      ? (labels[c.component_type] ??
                                        c.component_type)
                                      : "未提供"}
                                  </td>
                                  <td className="number">
                                    {display(c?.amount_decimal)}
                                  </td>
                                  <td>
                                    {display(c?.currency)} /{" "}
                                    {c?.unit
                                      ? (units[c.unit] ?? c.unit)
                                      : "未提供"}
                                  </td>
                                  <td>
                                    {display(c?.tier_conditions)} /{" "}
                                    {display(c?.cache_ttl)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="small muted">
                          税：{display(o.value.tax_status)} / 課金補足：
                          {display(o.value.billing_notes)}
                        </p>
                      </section>
                    ))}
                  </details>
                </>
              ) : (
                <div className="empty">
                  <span className="empty-symbol" aria-hidden="true">
                    —
                  </span>
                  <div>
                    <strong>
                      {report?.endpoints.latest.state === "error" || !report
                        ? "現在確認できません"
                        : "公開観測はまだありません"}
                    </strong>
                    <small>
                      取得後にmodel・input・output・unitを表示します。デモ価格は使用しません。
                    </small>
                  </div>
                </div>
              )}
              <div className="panel-note">
                二次カタログ · 不明な価格・税・条件は補完しません
              </div>
            </section>
          </div>
          <section className="detail-strip" aria-label="補足・詳細">
            <details className="detail-section" data-testid="health-details">
              <summary>
                <strong>health.datasets</strong>
                <span>公開件数・処理記録</span>
              </summary>
              <div className="detail-content">
                <Failure report={report} name="health" />
                {health && (
                  <>
                    <Badge>
                      {health.collector.monitor_connected === 0
                        ? "外部監視未接続"
                        : "最終記録では外部監視接続あり"}
                    </Badge>
                    <p className="small muted">
                      collection_enabledはpublic
                      DBの最終記録です。Cloudflareの現在のスイッチを確認した結果ではありません。
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>dataset</th>
                            <th>公開中の観測件数（API集計）</th>
                            <th>最終観測時刻</th>
                          </tr>
                        </thead>
                        <tbody>
                          {health.datasets.map((d) => (
                            <tr key={d.dataset}>
                              <td className="mono">{d.dataset}</td>
                              <td className="number">{d.count}</td>
                              <td>
                                <Time value={d.last_observed_at} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {health.datasets.length === 0 && (
                      <p className="panel-note">
                        公開中のdatasetはありません。初動前には正常な空状態です。
                      </p>
                    )}
                  </>
                )}
                <p className="small muted">
                  今日の収集件数・DB全件数・R2保存件数ではありません。latestはAPI仕様上、最大100行です。
                </p>
              </div>
            </details>
            <details className="detail-section" data-testid="raw-details">
              <summary>
                <strong>Raw JSON</strong>
                <span>応答・元のUTC時刻</span>
              </summary>
              <div className="detail-content">
                <p className="small muted">
                  取得したJSONとエンドポイント別の結果。元のUTC時刻を含みます。不正JSON・HTML・失敗本文は表示しません。
                </p>
                {report ? (
                  (Object.keys(ENDPOINTS) as EndpointKey[]).map((key) => (
                    <details className="endpoint-detail" key={key}>
                      <summary>
                        {ENDPOINTS[key].path} — {report.endpoints[key].state} /
                        HTTP {report.endpoints[key].http_status ?? "未受信"}
                      </summary>
                      <pre>
                        {JSON.stringify(report.endpoints[key], null, 2)}
                      </pre>
                    </details>
                  ))
                ) : (
                  <p>現在取得できたJSONはありません。</p>
                )}
              </div>
            </details>
            <details className="detail-section" data-testid="diagnostics">
              <summary>
                <strong>Diagnostics</strong>
                <span>診断・出典・補足</span>
              </summary>
              <div className="detail-content">
                <button onClick={() => void copy()}>診断情報をコピー</button>
                <p className="small" role="status">
                  {copied}
                </p>
                <p className="small muted">
                  公開APIから確認できる範囲だけを表示します。この画面を閉じている間は監視しません。private側の失敗理由・R2保存結果・Cloudflareの現在のCron設定は確認できません。
                </p>
                <p className="small muted">
                  初回予定は固定で、翌日に切り替えません。予定以降の公開観測を各ソースで1件以上確認しても、全モデル・全項目の完全取得や本番パイプライン全体の監査を意味しません。
                </p>
                <details className="endpoint-detail">
                  <summary>出典・取得範囲・利用条件・ライセンス</summary>
                  <SourceMetadata report={report} />
                </details>
              </div>
            </details>
          </section>
          <footer>
            <span>公開APIの読み取り専用</span>
            <a href={UPSTREAM + "/health"} target="_blank" rel="noreferrer">
              {UPSTREAM} ↗
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
