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
        "コピーできませんでした。下のJSONを選択してコピーしてください。",
      );
    }
  }
  return (
    <main>
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <span className="mark">AI</span> INVESTMENT RESEARCH{" "}
            <span className="divider">/</span> OPERATIONS
          </div>
          <h1>
            AI Investment Research<span>｜収集状況</span>
          </h1>
          <p className="subtitle">初回Collector稼働の公開結果を確認する画面</p>
        </div>
        <div className="header-tags">
          <Badge>読み取り専用</Badge>
          <span className="small muted">公開APIから確認できる範囲</span>
        </div>
      </header>
      <section className="toolbar" aria-label="表示の更新">
        <div>
          <span className={"pulse " + (state.auto ? "on" : "")} />
          <strong>{state.auto ? "自動更新 ON" : "自動更新 OFF"}</strong>
          <span className="muted small">
            {" "}
            {!state.auto
              ? "手動更新のみ"
              : state.hidden
                ? "非表示中は一時停止"
                : "60秒ごと"}
          </span>
        </div>
        <div className="controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            自動更新
          </label>
          <button
            className="primary"
            onClick={refresh}
            disabled={state.busy || waiting}
          >
            {state.busy ? "取得中…" : "今すぐ表示を更新"}
          </button>
        </div>
      </section>
      <p className="quiet">
        更新は公開APIの読み直しだけです。収集は実行しません。この画面を閉じている間は監視しません。
      </p>
      {waiting && (
        <p className="small muted" aria-live="polite">
          再取得可能：{jst(new Date(state.nextAllowedAt).toISOString())}
          （連打制限・Retry-Afterを反映）
        </p>
      )}
      {state.error && (
        <p className="notice error-text" role="alert">
          {state.error}。前回の観測値は表示していません。
        </p>
      )}
      <div className="stats" aria-live="polite">
        <Card
          label="API応答"
          note={
            state.busy
              ? "更新中：表示は直前に取得した結果"
              : "各エンドポイントの取得結果を確認"
          }
        >
          {state.busy && !report ? "取得中…" : apiLabel(report)}
        </Card>
        <Card
          label="この画面が最後に取得した時刻"
          note={
            state.error
              ? "前回受信時刻・現在の内容は未検証"
              : "ブラウザが応答を受信した時刻"
          }
        >
          <Time value={state.receivedAt} />
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
        <Card label="公開データ" note="公開APIの現在の応答に基づく表示">
          {publicDataLabel(report)}
        </Card>
      </div>
      <section className="panel initial">
        <div className="section-head">
          <div>
            <div className="eyebrow">INITIAL COLLECTION</div>
            <h2>初動確認</h2>
          </div>
          <span className="small muted">対象：ECB / Models.dev</span>
        </div>
        <div className="initial-grid">
          <div>
            <Badge tone={report ? result.tone : "neutral"}>
              {state.busy && !report ? "公開APIを確認中" : result.label}
            </Badge>
            <p>
              初回確認対象：
              <strong>
                <Time value={INITIAL_SLOT} />
              </strong>
            </p>
            <p className="small muted">
              {scheduleLabel(now)}。表示対象は翌日に切り替わりません。
            </p>
            {now >= Date.parse(INITIAL_SLOT) + 15 * 60000 &&
              checks.some((s) => !s.confirmed) &&
              report &&
              report.endpoints.latest.state !== "error" && (
                <p className="warning-text">
                  要確認：未確認のソースがあります。収集失敗や原因を断定するものではありません。
                </p>
              )}
          </div>
          <div className="schedule">
            <div>
              <span>日次収集の予定</span>
              <strong>毎日 03:17 JST</strong>
            </div>
            <div>
              <span>watchdogの予定</span>
              <strong>毎日 03:47 JST</strong>
            </div>
            <p className="small muted">
              設定に基づく参考予定です。Cloudflareの現在の設定をこの画面が確認した結果ではありません。
            </p>
          </div>
        </div>
        <p className="quiet boundary">
          各ソースで予定時刻以降の公開観測を1件以上確認すると確認済みになります。全モデル・全項目の完全取得、R2保存、パイプライン全体の監査を意味しません。
        </p>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>ソース別の公開観測</h2>
          <span className="small muted">
            判定基準：source_id ＋ observed_at
          </span>
        </div>
        <div className="source-grid">
          {checks.map((s) => (
            <article className="source-card" key={s.id}>
              <div className="source-title">
                <h3>
                  {s.name}
                  <span className="small muted">{s.id}</span>
                </h3>
                <Badge tone={report ? s.tone : "neutral"}>
                  {!report && !state.error ? "まだ未確認" : s.label}
                </Badge>
              </div>
              <dl>
                <dt>最新の観測時刻</dt>
                <dd>
                  <Time value={s.latest} />
                </dd>
                <dt>初回予定以降の観測</dt>
                <dd>
                  {s.confirmed
                    ? "確認済み"
                    : report?.endpoints.latest.state === "error" || state.error
                      ? "判定できない"
                      : "未確認"}
                </dd>
              </dl>
              {[...new Set(s.rows.map(freshnessLabel))].map((v, i) => (
                <p className="small source-note" key={i}>
                  {v}
                </p>
              ))}
              {s.rows.length === 0 && (
                <p className="small muted">
                  この応答から対象の実観測を確認できていません。
                </p>
              )}
            </article>
          ))}
        </div>
        <Failure report={report} name="latest" />
        <p className="quiet">
          ECBのsource_dateは元データの日付です。今回の取得確認にはobserved_atを使います。ソース情報への掲載有無だけでは無効化を判定できません。
        </p>
        {report?.endpoints.latest.data?.data.some(
          (o) => o.data_origin !== "live",
        ) && (
          <p className="warning-text">
            合成データが応答に含まれています。実観測の確認・価格表から除外しました。
          </p>
        )}
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>
            FX <span className="small muted">為替参照値</span>
          </h2>
          <span className="small muted">ECB / 公開APIが返した値</span>
        </div>
        {fx.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>通貨ペア</th>
                  <th>為替値</th>
                  <th>
                    元データ日付<small>source_date</small>
                  </th>
                  <th>
                    観測時刻<small>observed_at</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fx.map((o) => (
                  <tr key={o.observation_id}>
                    <td>
                      <strong>
                        {display(o.value.base_currency)} /{" "}
                        {display(o.value.quote_currency)}
                      </strong>
                      <small>
                        {o.value.reference_rate_type === "project_calculation"
                          ? "APIによる計算値（ECB公表クロスではありません）"
                          : o.value.reference_rate_type === "ECB_reference"
                            ? "ECB参照値"
                            : "参照種別：未提供"}
                      </small>
                    </td>
                    <td className="number">
                      {display(o.value.rate_decimal)}
                      <small>
                        1 {display(o.value.base_currency)} あたりの{" "}
                        {display(o.value.quote_currency)}
                      </small>
                    </td>
                    <td>{display(o.source_date)}</td>
                    <td>
                      <Time value={o.observed_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {report?.endpoints.latest.state === "error" || !report
              ? "現在確認できません。"
              : "まだ公開観測がありません。取得した値がここに表示されます。"}
          </p>
        )}
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>AI API価格</h2>
          <span className="small muted">Models.dev / 二次カタログ</span>
        </div>
        {ai.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>モデル / 提供元</th>
                  <th>価格区分</th>
                  <th>金額</th>
                  <th>通貨 / 課金単位</th>
                  <th>観測時刻</th>
                </tr>
              </thead>
              <tbody>
                {ai.flatMap((o) =>
                  (o.value.price_components?.length
                    ? o.value.price_components
                    : [null]
                  ).map((c, i) => (
                    <tr key={o.observation_id + "-" + i}>
                      <td>
                        <strong>{display(o.value.model_id)}</strong>
                        <small>
                          {display(o.value.serving_provider)}
                          {c?.tier_conditions && " / " + c.tier_conditions}
                        </small>
                      </td>
                      <td>
                        {c?.component_type
                          ? (labels[c.component_type] ?? c.component_type)
                          : "未提供"}
                      </td>
                      <td className="number">{display(c?.amount_decimal)}</td>
                      <td>
                        {display(c?.currency)}
                        <small>
                          {c?.unit ? (units[c.unit] ?? c.unit) : "未提供"}
                        </small>
                      </td>
                      <td>
                        <Time value={o.observed_at} />
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {report?.endpoints.latest.state === "error" || !report
              ? "現在確認できません。"
              : "まだ公開観測がありません。デモ価格は表示しません。"}
          </p>
        )}
        <p className="quiet">
          選定されたモデルのみ。メーカーが確認した一次価格ではありません。税・追加料金など不明な条件は推測しません。
        </p>
        {ai.map(
          (o) =>
            o.value.billing_notes && (
              <p className="small" key={o.observation_id}>
                {o.value.model_id}：{o.value.billing_notes}
              </p>
            ),
        )}
      </section>
      <section className="panel details-panel">
        <div className="section-head">
          <h2>詳細・診断</h2>
          <button onClick={() => void copy()}>診断情報をコピー</button>
        </div>
        <p className="small" role="status">
          {copied}
        </p>
        <Failure report={report} name="health" />
        {health && (
          <>
            <div className="monitor">
              <Badge>
                {health.collector.monitor_connected === 0
                  ? "外部監視未接続"
                  : "最終記録では外部監視接続あり"}
              </Badge>
              <span className="small muted">
                このGUIはCloudflareの現在のスイッチや監視設定を直接確認しません。
              </span>
            </div>
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
                      <td>{d.dataset}</td>
                      <td>{d.count}</td>
                      <td>
                        <Time value={d.last_observed_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {health.datasets.length === 0 && (
              <p className="empty">
                公開中のdatasetはありません。初動前には正常な空状態です。
              </p>
            )}
          </>
        )}
        <p className="quiet">
          この件数は今日の収集件数・DB全件数・R2保存件数ではありません。latestはAPI仕様上、最大100行です。
        </p>
        <details>
          <summary>
            取得したJSONとエンドポイント別の結果（元のUTC時刻を含む）
          </summary>
          <p className="small">
            不正JSON・HTMLや失敗した本文は表示しません。確認できたJSONと取得診断だけを表示します。
          </p>
          {report ? (
            (Object.keys(ENDPOINTS) as EndpointKey[]).map((key) => (
              <details key={key}>
                <summary>
                  {ENDPOINTS[key].path} — {report.endpoints[key].state} / HTTP{" "}
                  {report.endpoints[key].http_status ?? "未受信"}
                </summary>
                <pre>{JSON.stringify(report.endpoints[key], null, 2)}</pre>
              </details>
            ))
          ) : (
            <p>現在取得できたJSONはありません。</p>
          )}
        </details>
        <details>
          <summary>出典・取得範囲・利用条件・ライセンス</summary>
          <SourceMetadata report={report} />
        </details>
      </section>
      <footer>
        <p>
          接続先：
          <a href={UPSTREAM + "/health"} target="_blank" rel="noreferrer">
            {UPSTREAM}
          </a>
        </p>
        <p>
          公開APIの読み取り専用。private側の失敗理由、R2保存結果、Cloudflareの現在のCron設定は確認できません。
        </p>
      </footer>
    </main>
  );
}
