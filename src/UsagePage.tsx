import type { Usage } from "./contracts.ts";
import { UsageStatusClass } from "./contracts.ts";
import { Panel, Empty } from "./console-ui.tsx";
import { href } from "./console-router.ts";
const classes = UsageStatusClass.options;
const colors = ["#23856d", "#527fb6", "#bb8821", "#ce6728", "#c23d55"];
const number = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
function country(code: string) {
  if (code === "XX") return "不明 (XX)";
  if (code === "T1") return "Tor (T1)";
  const flag = [...code].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("");
  return `${flag} ${new Intl.DisplayNames(["ja"], { type: "region" }).of(code) ?? code} (${code})`;
}
export function UsagePage({ report, period, error }: { report: Usage | null; period: string; error: string | null }) {
  const controls = <nav aria-label="利用状況の期間">{["7d", "30d", "90d"].map(p => <a key={p} className="button-link" aria-current={period === p ? "page" : undefined} href={href("Usage", { period: p })}>{p.slice(0, -1)}日</a>)}</nav>;
  if (!report || report.status !== "ok") return <Panel title="API利用状況" tools={controls}><p role="status">{error ?? (report?.status === "permission_denied" ? "Cloudflareの鍵に利用状況を読む権限（Account Analytics: Read）がありません" : report?.status === "unconfigured" ? "利用状況の取得設定がありません。" : report?.status === "error" ? "利用状況を取得できません。時間をおいて再確認してください。" : "取得中…")}</p></Panel>;
  const total = report.daily.reduce((n, r) => n + r.calls, 0);
  const limited = report.daily.filter(r => r.statusClass === "429").reduce((n, r) => n + r.calls, 0);
  const errors = report.daily.filter(r => r.statusClass === "5xx").reduce((n, r) => n + r.calls, 0);
  const days = [...new Set(report.daily.map(r => r.day))].sort();
  const count = (day: string, status: string) => report.daily.filter(r => r.day === day && r.statusClass === status).reduce((n, r) => n + r.calls, 0);
  const max = Math.max(1, ...days.map(d => classes.reduce((n, s) => n + count(d, s), 0)));
  const routes = [...new Set(report.matrix.map(r => r.route))].slice(0, 10);
  const countries = [...new Set(report.matrix.map(r => r.country))].slice(0, 10);
  return <>
    <Panel title="API利用状況" tools={controls}><p>自分たちの確認作業も含まれます</p><p className="muted">標本補正を含む推計値です。日別はUTC、直近{period.slice(0, -1)}日。国・地域は接続元の推定です。</p>
      <div className="overview-stats">{[["総呼び出し数", number(total)], ["国・地域数", number(report.countries.length)], ["429件数", number(limited)], ["5xxエラー率", total ? `${(errors / total * 100).toFixed(2)}%` : "—"]].map(([label, value]) => <div className="stat" key={label}><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong></div>)}</div>
    </Panel>
    {!total ? <Panel title="記録なし"><Empty>この期間の利用記録はありません。</Empty></Panel> : <>
      <Panel title="日別の呼び出し数（UTC）"><p>{classes.map((s, i) => <span key={s} style={{ color: colors[i], marginRight: 12 }}>● {s}</span>)}</p><div className="usage-days">{days.map(d => <div className="usage-day" key={d}><span>{d}</span><svg preserveAspectRatio="none" viewBox="0 0 100 12" role="img" aria-label={`${d}: ${classes.map(s => `${s} ${number(count(d, s))}`).join('、')}`}><title>{d}</title>{classes.map((s, i) => <rect key={s} x={classes.slice(0, i).reduce((n, c) => n + count(d, c), 0) / max * 100} y="0" width={count(d, s) / max * 100} height="12" fill={colors[i]} />)}</svg></div>)}</div></Panel>
      <Panel title="エンドポイント別"><div className="table-wrap"><table><thead><tr>{["エンドポイント", "呼び出し数", "構成比", "429", "5xx"].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{report.endpoints.map(r => <tr key={r.route}><td>{r.route}</td><td>{number(r.calls)}</td><td>{(r.calls / total * 100).toFixed(1)}%</td><td>{number(r.rateLimited)}</td><td>{number(r.errors)}</td></tr>)}</tbody></table></div></Panel>
      <Panel title="国・地域別"><div className="table-wrap"><table><thead><tr><th>国・地域</th><th>呼び出し数</th></tr></thead><tbody>{report.countries.map(r => <tr key={r.country}><td>{country(r.country)}</td><td>{number(r.calls)}</td></tr>)}</tbody></table></div></Panel>
      <Panel title="エンドポイント × 国・地域"><p>上位100組から最大10行・10列を表示。—は上位集計に含まれない組です。</p><div className="table-wrap"><table><thead><tr><th>エンドポイント</th>{countries.map(c => <th key={c}>{country(c)}</th>)}</tr></thead><tbody>{routes.map(r => <tr key={r}><th>{r}</th>{countries.map(c => <td key={c}>{report.matrix.some(x => x.route === r && x.country === c) ? number(report.matrix.find(x => x.route === r && x.country === c)!.calls) : "—"}</td>)}</tr>)}</tbody></table></div></Panel>
    </>}
  </>;
}
