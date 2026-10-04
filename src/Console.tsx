import { useEffect, useState } from "react";
import { AdminReport } from "./admin-contract.ts";
import { InfrastructureSchema } from "./infrastructure-contract.ts";
import { InfrastructurePage } from "./Operations.tsx";
import { useRead } from "./use-read.ts";
import {
  pages,
  parseLocation,
  href,
  retained,
  apiURL,
} from "./console-router.ts";
import {
  Timezone,
  Timestamp,
  Badge,
  OverviewPage,
  SourcesPage,
  Filters,
} from "./console-ui.tsx";
import {
  RunsPage,
  DataPage,
  RightsPage,
  SettingsPage,
  ReleasesPage,
  Diagnostics,
} from "./ConsolePages.tsx";
export function Console() {
  const [location, setLocation] = useState(() =>
    parseLocation(window.location.hash),
  );
  const [auto, setAuto] = useState(true),
    [zone, setZone] = useState("Asia/Tokyo"),
    [now, setNow] = useState(Date.now()),
    [diagnostics, setDiagnostics] = useState(false);
  useEffect(() => {
    const changed = () => {
      setLocation(parseLocation(window.location.hash));
      setDiagnostics(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", changed);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("hashchange", changed);
      clearInterval(timer);
    };
  }, []);
  const interval =
    location.page === "Data"
      ? null
      : ["Overview", "Runs"].includes(location.page)
        ? 60000
        : 300000;
  const frozen = location.params.has("as_of") || location.params.has("cursor");
  const unfreeze = () => {
    const next = href(location.page, {
      ...Object.fromEntries(location.params),
      as_of: null,
      cursor: null,
    });
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new Event("hashchange"));
  };
  useEffect(() => {
    if (
      !auto ||
      !frozen ||
      location.params.has("cursor") ||
      !["Overview", "Runs"].includes(location.page)
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) unfreeze();
    }, 60000);
    return () => clearInterval(timer);
  }, [auto, location.page, location.params.toString()]);
  const state = useRead(
    apiURL(location),
    (v) => AdminReport.parse(v),
    frozen ? null : interval,
    auto,
  );
  const needsInfra = [
    "Overview",
    "Infrastructure",
    "Releases",
    "Settings",
  ].includes(location.page);
  const infra = useRead(
    needsInfra ? "/api/infrastructure" : null,
    (v) => InfrastructureSchema.parse(v),
    300000,
    auto,
  );
  const report = state.data,
    busy = state.busy || (needsInfra && infra.busy);
  return (
    <Timezone.Provider value={zone}>
      <div className="app-shell console-shell">
        <a
          className="skip-link"
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          本文へ移動
        </a>
        <aside className="sidebar" aria-label="管理メニュー">
          <div className="sidebar-brand">
            <span className="brand-mark">AI</span>
            <div>
              Investment Research<small>OPERATIONS CONSOLE</small>
            </div>
          </div>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="メインナビゲーション">
            {pages.map((p) => (
              <a
                className={"nav-item " + (location.page === p ? "active" : "")}
                href={href(p, retained(location, p))}
                aria-current={location.page === p ? "page" : undefined}
                key={p}
              >
                {p}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="small-label">READ-ONLY OPERATIONS</span>
            <p>収集・設定の操作は行いません。</p>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-brand">
              AI Investment Research <Badge value="読み取り専用" />
            </div>
            <div className="topbar-controls">
              <label>
                時刻
                <select
                  aria-label="表示タイムゾーン"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                >
                  <option value="Asia/Tokyo">JST</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                自動更新
              </label>
              <button
                className="primary"
                onClick={() => {
                  if (frozen) unfreeze();
                  else state.refresh();
                  if (needsInfra) infra.refresh();
                }}
                disabled={
                  busy ||
                  now <
                    (location.page === "Infrastructure"
                      ? infra.nextAllowedAt
                      : state.nextAllowedAt)
                }
              >
                {busy ? "取得中…" : "今すぐ更新"}
              </button>
            </div>
          </header>
          <main id="main-content" tabIndex={-1}>
            <div className="overview-heading">
              <div>
                <p className="breadcrumb">Workspace / {location.page}</p>
                <h1>{location.page}</h1>
              </div>
              <div className="small muted">
                更新：
                <Timestamp
                  value={
                    location.page === "Infrastructure"
                      ? infra.receivedAt
                      : state.receivedAt
                  }
                />
                <small>
                  {location.page === "Data"
                    ? "手動更新"
                    : auto
                      ? "表示中のみ自動更新"
                      : "自動更新OFF"}
                </small>
                {report && location.page !== "Overview" && (
                  <small>
                    検索上限：
                    <Timestamp value={report.as_of} />
                  </small>
                )}
              </div>
            </div>
            {state.error && (
              <p className="notice error-text" role="alert">
                {state.error}
              </p>
            )}
            {report && report.state !== "ready" && (
              <p className="notice" role="status">
                <Badge value={report.state} /> {report.issues.join(", ")}
                。未取得情報を正常とは判定しません。
              </p>
            )}
            {!["Overview", "Infrastructure", "Releases"].includes(
              location.page,
            ) && <Filters location={location} />}
            {location.page === "Overview" && (
              <OverviewPage
                report={report}
                infra={infra.data}
                now={now}
                allAttention={location.params.get("attention") === "all"}
              />
            )}
            {location.page === "Sources" && <SourcesPage report={report} />}
            {location.page === "Runs" && (
              <RunsPage report={report} location={location} now={now} />
            )}
            {location.page === "Data" && (
              <DataPage report={report} location={location} />
            )}
            {location.page === "Rights" && <RightsPage report={report} />}
            {location.page === "Settings" && (
              <SettingsPage report={report} infra={infra.data} />
            )}
            {location.page === "Releases" && (
              <ReleasesPage
                report={report}
                infra={infra.data}
                location={location}
              />
            )}
            {location.page === "Infrastructure" && (
              <>
                <InfrastructurePage
                  state={{
                    report: infra.data,
                    busy: infra.busy,
                    error: infra.error,
                    nextAllowedAt: infra.nextAllowedAt,
                  }}
                  now={now}
                  refresh={infra.refresh}
                />
                <details
                  className="panel console-panel"
                  open={diagnostics}
                  onToggle={(e) => setDiagnostics(e.currentTarget.open)}
                >
                  <summary className="section-head">公開API診断</summary>
                  {diagnostics && <Diagnostics />}
                </details>
              </>
            )}
          </main>
          <footer>読み取り専用 · 各情報の取得時刻と確認範囲を表示</footer>
        </div>
      </div>
    </Timezone.Provider>
  );
}
