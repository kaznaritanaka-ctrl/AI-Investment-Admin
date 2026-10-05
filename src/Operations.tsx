import type { Status } from "./contracts.ts";
import type { Check, Infrastructure } from "./infrastructure-contract.ts";
import type { InfraPollState } from "./infrastructure-poller.ts";
import { checkLabel, infrastructureStale } from "./infrastructure-contract.ts";
import {
  sourceRows,
  operationsHealth,
  attentionItems,
} from "./operations-model.ts";
import { jst, freshnessLabel } from "./view-model.ts";

const value = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "未取得" : String(v);
const bytes = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "未取得";
  if (v < 1024) return `${v} B`;
  const unit = v < 1024 * 1024 ? "KiB" : "MiB";
  const divisor = unit === "KiB" ? 1024 : 1024 * 1024;
  return `${(v / divisor).toLocaleString("ja-JP", { maximumFractionDigits: 2 })} ${unit}`;
};
const tone = (s: string) =>
  s === "Healthy" ? "success" : s === "Warning" ? "warning" : "neutral";
function State({ check }: { check?: Check }) {
  return (
    <span
      className={`badge ${check?.state === "ok" ? "success" : check?.state === "missing" || check?.state === "stale" ? "warning" : "neutral"}`}
    >
      {checkLabel(check)}
    </span>
  );
}
function DateTime({ stamp }: { stamp?: string | null }) {
  return stamp ? (
    <time dateTime={stamp}>{jst(stamp)}</time>
  ) : (
    <span className="muted">未取得</span>
  );
}
const toggle = (v: boolean | null) =>
  v === null ? "未取得" : v ? "ON" : "OFF";

export function OperationsSummary({
  report,
  infra,
  now,
}: {
  report: Status | null;
  infra: Infrastructure | null;
  now: number;
}) {
  const rows = sourceRows(report, now),
    healthy = rows.filter((s) => s.freshness === "Healthy").length;
  const last = rows
    .map((s) => s.latest)
    .filter((s): s is string => !!s)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const collector = infra?.workers.find(
    (w) => w.name === "ai-investment-collector",
  );
  const dbSize =
    infra &&
    infra.d1.length === 2 &&
    infra.d1.every((d) => d.metadata.storage_bytes !== null)
      ? infra.d1.reduce((s, d) => s + d.metadata.storage_bytes!, 0)
      : null;
  const system = operationsHealth(report, infra, now);
  const stale = infra ? infrastructureStale(infra, now) : false;
  return (
    <div className="stats cockpit-stats" aria-live="polite">
      <section className="stat">
        <h2>System health</h2>
        <div className={`stat-value ${tone(system)}-text`}>{system}</div>
        <div className="stat-note">公開観測・取得可能なplatform情報の範囲</div>
      </section>
      <section className="stat">
        <h2>Last live observation</h2>
        <div className="stat-value">
          <DateTime stamp={last} />
        </div>
        <div className="stat-note">取得した観測内の最新observed_at</div>
      </section>
      <section className="stat">
        <h2>Source health</h2>
        <div className="stat-value">
          {healthy} <small>/ {rows.length} Healthy</small>
        </div>
        <div className="stat-note">価格差ではなくlive観測の鮮度</div>
      </section>
      <section className="stat">
        <h2>Watchdog state</h2>
        <div className="stat-value">Unknown</div>
        <div className="stat-note">実行結果未取得 · continuationも未取得</div>
      </section>
      <section className="stat">
        <h2>Worker CPU</h2>
        <div className="stat-value">
          {value(collector?.metrics.cpu_ms_p99)}{" "}
          {collector?.metrics.cpu_ms_p99 !== null &&
            collector?.metrics.cpu_ms_p99 !== undefined && <small>ms</small>}
        </div>
        <div className="stat-note">
          Collector p99 · 24h ·{" "}
          {stale ? "Stale" : "採取範囲はInfrastructure参照"}
        </div>
      </section>
      <section className="stat">
        <h2>D1 usage</h2>
        <div className="stat-value">{bytes(dbSize)}</div>
        <div className="stat-note">private + public storage · 対象2DBのみ</div>
      </section>
      <section className="stat">
        <h2>R2 usage</h2>
        <div className="stat-value">
          {bytes(infra?.r2.storage.payload_bytes)}
        </div>
        <div className="stat-note">
          evidence payload ·{" "}
          {infra?.r2.storage.state === "stale"
            ? "古いサンプル"
            : "account総量ではありません"}
        </div>
      </section>
      <section className="stat">
        <h2>Workers plan</h2>
        <div className="stat-value">
          {infra?.plan.value === "free"
            ? "Free"
            : infra?.plan.value === "paid"
              ? "Paid"
              : "Unknown"}
        </div>
        <div className="stat-note">
          {infra?.plan.verification === "manual_evidence"
            ? "Manual evidence · API確認ではありません"
            : "未取得 · subscription不在から推定しません"}
        </div>
      </section>
    </div>
  );
}

export function InfrastructureSummary({
  state,
  now,
}: {
  state: InfraPollState;
  now: number;
}) {
  const infra = state.report;
  return (
    <section
      className="panel infrastructure-summary"
      aria-labelledby="infra-summary-title"
    >
      <div className="section-head">
        <h2 id="infra-summary-title">Infrastructure summary</h2>
        <span className="small muted">
          {infra && infrastructureStale(infra, now) ? "Stale" : "5分更新"}
        </span>
      </div>
      {!infra || infra.availability === "unavailable" ? (
        <div className="empty">
          <div>
            <strong>Cloudflare metrics unavailable</strong>
            <small>
              {infra?.configuration === "token_not_configured"
                ? "Worker Secret未設定。公開APIの表示は継続します。"
                : infra?.configuration === "account_not_configured"
                  ? "対象アカウント未設定・不一致"
                  : "未取得・権限・接続状態をInfrastructureで確認"}
            </small>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>requests / errors · 24h</th>
                <th>CPU p99 · ms</th>
              </tr>
            </thead>
            <tbody>
              {infra.workers.map((w) => (
                <tr key={w.name}>
                  <td className="mono">
                    {w.name.replace("ai-investment-", "")}
                    <small>{checkLabel(w.metrics)}</small>
                  </td>
                  <td className="mono">
                    {value(w.metrics.requests)} / {value(w.metrics.errors)}
                  </td>
                  <td className="mono">{value(w.metrics.cpu_ms_p99)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel-note">
        Cloudflare取得：
        <DateTime stamp={infra?.fetched_at} /> ·
        窓内のaggregate、請求額・Free枠の残量ではありません。
      </div>
    </section>
  );
}
export function Attention({
  report,
  infra,
  now,
}: {
  report: Status | null;
  infra: Infrastructure | null;
  now: number;
}) {
  return (
    <section
      className="panel attention-panel"
      aria-labelledby="attention-title"
    >
      <div className="section-head">
        <h2 id="attention-title">Attention / Review items</h2>
        <span className="small muted">操作・通知は行いません</span>
      </div>
      <ul className="attention-list">
        {attentionItems(report, infra, now).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}
export function SourcesPage({
  report,
  now,
}: {
  report: Status | null;
  now: number;
}) {
  const rows = sourceRows(report, now);
  return (
    <div className="sources-page">
      <p className="page-intro">
        公開APIが返したsource
        metadataとlive観測。掲載がないsourceをdisabledとは判定しません。件数は取得した応答内の範囲です（各最大100行、FXは専用取得）。
      </p>
      <section className="panel">
        <div className="section-head">
          <h2>Source inventory</h2>
          <span className="small muted">Public projection</span>
        </div>
        <div className="table-wrap">
          <table className="source-inventory">
            <thead>
              <tr>
                <th>source_id / dataset</th>
                <th>enabled / policy</th>
                <th>last observed_at / source_date</th>
                <th>公開latest内件数 / freshness</th>
                <th>rights / version</th>
                <th>valid_until / review / retention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small className="mono">
                      {s.id} / {value(s.dataset)}
                    </small>
                  </td>
                  <td>
                    有効・無効：未取得
                    <small>
                      {s.source
                        ? "公開policy掲載あり（現在の設定は未取得）"
                        : "policy：未取得"}
                    </small>
                  </td>
                  <td>
                    <DateTime stamp={s.latest} />
                    <small className="mono">
                      source_date: {value(s.sourceDate)}
                    </small>
                  </td>
                  <td>
                    <span className="number">{value(s.count)}</span>
                    <small>応答内観測件数・全履歴ではありません</small>
                    <span className={`badge ${tone(s.freshness)}`}>
                      {s.freshness}
                    </span>
                  </td>
                  <td>
                    {s.source ? (
                      <>
                        <span className="mono">{s.source.rights_version}</span>
                        <small>
                          {Object.entries(s.source.rights)
                            .map(([name, status]) => `${name}: ${status}`)
                            .join(" / ") || "未取得"}
                        </small>
                      </>
                    ) : (
                      "未取得"
                    )}
                  </td>
                  <td>
                    未取得<small>現行公開APIでは期限・retention非提供</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="source-details-grid">
        {rows.map((s) => (
          <section className="panel" key={s.id}>
            <div className="section-head">
              <h2>
                {s.name} <span>Known limitations / policy evidence</span>
              </h2>
            </div>
            <div className="detail-content">
              <p>{s.source?.limitations.join(" / ") || "制限情報：未取得"}</p>
              <p className="small muted">
                {s.source?.conditions.join(" / ") || "利用条件：未取得"}
              </p>
              <p className="small muted">
                {[...new Set(s.rows.map(freshnessLabel))].join(" / ") ||
                  "live観測：未取得"}
              </p>
              {s.source?.license_url && (
                <a href={s.source.license_url} target="_blank" rel="noreferrer">
                  API提供のライセンス ↗
                </a>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="panel-note">
        GPU /
        OpenRouter等の未返却source：未取得。repository設定の埋込み、一覧の完全性、有効化状態の推測は行いません。HealthyはAPI
        stale判定なし・最新観測36時間以内という画面上の基準で、価格変動を必要としません。
      </p>
    </div>
  );
}

export function InfrastructurePage({
  state,
  now,
  refresh,
}: {
  state: InfraPollState;
  now: number;
  refresh: () => void;
}) {
  const r = state.report;
  const unavailable = !r || r.availability === "unavailable";
  return (
    <div className="infrastructure-page">
      <div className="page-intro infra-toolbar">
        <div>
          <strong>
            {unavailable
              ? "Cloudflare metrics unavailable"
              : r.availability === "partial"
                ? "Warning · Partial API results"
                : "Cloudflare read-only snapshot"}
          </strong>
          <small>
            取得：
            <DateTime stamp={r?.fetched_at} />
            {r && infrastructureStale(r, now) && (
              <span className="warning-text"> · Stale（15分超前）</span>
            )}
          </small>
        </div>
        <button
          onClick={refresh}
          disabled={state.busy || now < state.nextAllowedAt}
        >
          {state.busy ? "取得中…" : "Cloudflare情報を更新"}
        </button>
      </div>
      {unavailable && (
        <p className="notice">
          {r?.configuration === "token_not_configured"
            ? "Cloudflare read-only tokenは未設定です。Worker Secretの登録には所有者の承認が必要です。"
            : r?.configuration === "account_not_configured"
              ? "CF_ACCOUNT_ID未設定または対象アカウントと不一致です。"
              : "認証・permission・rate limit・応答形式を確認してください。未取得は0にしません。"}{" "}
          既存の公開API確認は継続します。
        </p>
      )}
      <section className="panel">
        <div className="section-head">
          <h2>Production Workers</h2>
          <span className="small muted">
            requests / CPU / errors：直近24h・GraphQL adaptive集計
          </span>
        </div>
        <div className="table-wrap">
          <table className="workers-table">
            <thead>
              <tr>
                <th>Worker / metadata</th>
                <th>production version / traffic</th>
                <th>Cron · UTC / Custom Domains</th>
                <th>Observability / public endpoints</th>
                <th>requests / errors</th>
                <th>CPU p50 / p99 · ms</th>
              </tr>
            </thead>
            <tbody>
              {r?.workers.map((w) => (
                <tr key={w.name}>
                  <td>
                    <strong className="mono">{w.name}</strong>
                    <small>
                      <State check={w.metadata} />
                    </small>
                  </td>
                  <td>
                    {w.deployment.versions?.map((v) => (
                      <div className="mono" key={v.id}>
                        {v.id}
                        <small>{v.percentage}% traffic</small>
                      </div>
                    )) ?? "未取得"}
                    <small>
                      <DateTime stamp={w.deployment.created_at} />
                    </small>
                    {w.deployment.state !== "ok" && (
                      <State check={w.deployment} />
                    )}
                  </td>
                  <td>
                    <span className="mono">
                      {w.schedules.crons === null
                        ? "Cron：未取得"
                        : w.schedules.crons.length
                          ? w.schedules.crons.join(" / ")
                          : "Cronなし"}
                    </span>
                    {w.schedules.state !== "ok" && (
                      <small>
                        <State check={w.schedules} />
                      </small>
                    )}
                    <small>
                      {w.domains.hostnames === null
                        ? "Domain：未取得"
                        : w.domains.hostnames.join(" / ") ||
                          "Custom Domainなし"}
                    </small>
                    {w.domains.state !== "ok" && <State check={w.domains} />}
                  </td>
                  <td>
                    Observability: {toggle(w.observability)}
                    <small>
                      workers.dev: {toggle(w.exposure.workers_dev)} / preview:{" "}
                      {toggle(w.exposure.preview_urls)}
                    </small>
                    {w.exposure.state !== "ok" && <State check={w.exposure} />}
                  </td>
                  <td className="mono">
                    {value(w.metrics.requests)} / {value(w.metrics.errors)}
                    <small>
                      <State check={w.metrics} />
                    </small>
                  </td>
                  <td className="mono">
                    {value(w.metrics.cpu_ms_p50)} /{" "}
                    {value(w.metrics.cpu_ms_p99)}
                    <small>
                      最終event <DateTime stamp={w.metrics.latest_at} />
                    </small>
                  </td>
                </tr>
              )) ?? (
                <tr>
                  <td colSpan={6}>未取得</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Cronの有無は設定の観測です。watchdog /
          continuationの成否・checkpoint、例外ログ本文は未取得。runtime
          errorsはplatform集計で、業務上の収集エラーとは別です。
        </p>
      </section>
      <div className="source-details-grid">
        <section className="panel">
          <div className="section-head">
            <h2>D1 databases</h2>
            <span className="small muted">metadata / aggregates only</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Database</th>
                  <th>storage</th>
                  <th>rows read / written · 24h</th>
                </tr>
              </thead>
              <tbody>
                {r?.d1.map((d) => (
                  <tr key={d.name}>
                    <td className="mono">
                      {d.name}
                      <small>
                        <State check={d.metadata} />
                      </small>
                    </td>
                    <td>{bytes(d.metadata.storage_bytes)}</td>
                    <td className="mono">
                      {value(d.metrics.rows_read)} /{" "}
                      {value(d.metrics.rows_written)}
                      <small>
                        <State check={d.metrics} />
                      </small>
                      <small>
                        最終event <DateTime stamp={d.metrics.latest_at} />
                      </small>
                    </td>
                  </tr>
                )) ?? (
                  <tr>
                    <td colSpan={3}>未取得</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>R2 evidence</h2>
            <State check={r?.r2.metadata} />
          </div>
          <div className="detail-content">
            <p className="mono">{r?.r2.name ?? "未取得"}</p>
            <dl className="metric-list">
              <div>
                <dt>Payload / metadata</dt>
                <dd>
                  {bytes(r?.r2.storage.payload_bytes)} /{" "}
                  {bytes(r?.r2.storage.metadata_bytes)}
                </dd>
              </div>
              <div>
                <dt>Objects / operations · 24h</dt>
                <dd>
                  {value(r?.r2.storage.objects)} /{" "}
                  {value(r?.r2.operations.requests)}
                </dd>
              </div>
              <div>
                <dt>Storage sample</dt>
                <dd>
                  <DateTime stamp={r?.r2.storage.latest_at} />{" "}
                  <State check={r?.r2.storage} />
                </dd>
              </div>
              <div>
                <dt>Operations sample</dt>
                <dd>
                  <DateTime stamp={r?.r2.operations.latest_at} />{" "}
                  <State check={r?.r2.operations} />
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>Workers plan / scope</h2>
          <span className="badge neutral">{r?.plan.value ?? "unknown"}</span>
        </div>
        <div className="detail-content">
          <p>
            {r?.plan.verification === "manual_evidence"
              ? "Manual evidence / not API-verifiable"
              : "未取得。subscriptionが存在しないことからFreeを推定しません。"}{" "}
            <DateTime stamp={r?.plan.verified_at} />
          </p>
          {r?.plan.evidence && <p className="small muted">{r.plan.evidence}</p>}
          <p className="small muted">
            集計窓：
            <DateTime stamp={r?.window.start} /> →{" "}
            <DateTime stamp={r?.window.end} />
            。対象3 Workers・2 D1・1
            R2のみ。日次UTC利用枠・月次課金量・account全体の使用率には換算しません。空series
            / null / 失敗は0ではありません。
          </p>
          <p className="small muted">
            Access保護は2026-09-30のMCP監査で確認済み。画面内での継続的なAccess監査は未実装です。D1行・R2オブジェクト本文・Secret値は取得しません。
          </p>
        </div>
      </section>
      {r && (
        <details className="detail-section infra-issues">
          <summary>取得診断（projectionのみ）</summary>
          <div className="detail-content">
            <p>Cloudflare raw responseや認証情報は含みません。Retry-After:</p>
            {[
              ...r.workers.flatMap((w) => [
                w.metrics,
                w.metadata,
                w.deployment,
                w.schedules,
                w.domains,
                w.exposure,
              ]),
              ...r.d1.flatMap((d) => [d.metrics, d.metadata]),
              r.r2.metadata,
              r.r2.storage,
              r.r2.operations,
            ]
              .filter((c) => c.retry_at)
              .map((c, i) => (
                <p key={i}>
                  <DateTime stamp={c.retry_at} />
                </p>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
