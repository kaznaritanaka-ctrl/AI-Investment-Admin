import { z } from "zod";
import {
  HighresoRuns,
  HighresoLatestPrices,
} from "./admin-highreso-contract.ts";
import { Panel, Empty } from "./console-ui.tsx";
const HighresoResponse = z
  .object({ runs: HighresoRuns, prices: HighresoLatestPrices })
  .strict();
export const parseHighreso = (value: unknown) => HighresoResponse.parse(value);
type Data = z.infer<typeof HighresoResponse>;
function Reference({ url, label }: { url: string | null; label: string }) {
  const safe = url && /^https?:\/\//i.test(url);
  return safe ? (
    <a href={url} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span>
      {label}：{url ?? "未提供"}
    </span>
  );
}
const utc = (value: string | null) =>
  value ?? "未確認（読み取り可能な履歴内で未確立）";
export function HighresoPage({ data }: { data: Data | null }) {
  if (!data)
    return (
      <Empty>
        非公開調査データを現在取得できません。未取得を正常とは判定しません。
      </Empty>
    );
  return (
    <>
      <p className="notice">
        非公開の研究用データです。公開・再配布の許可を意味しません。
      </p>
      {[data.runs.source, data.prices.source].map((source, i) => (
        <Panel title={i === 0 ? "収集履歴の出典" : "価格の出典"} key={i}>
          <p>{source.attribution_text}</p>
          <p>
            <Reference url={source.source_url} label="提供元" /> ·{" "}
            <Reference url={source.terms_url} label="利用規約" /> ·{" "}
            <Reference url={source.license_url} label="ライセンス" />
          </p>
        </Panel>
      ))}
      <Panel title="最近の収集（最大30回）">
        {data.runs.runs.length ? (
          <div
            className="table-wrap"
            role="region"
            aria-label="ハイレゾ収集履歴"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    "収集日 (JST)",
                    "予定時刻 (UTC)",
                    "実行ID",
                    "状態",
                    "保存済み観測数",
                    "最終エラー",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.runs.runs.map((run) => (
                  <tr key={run.run_id}>
                    <td>{run.run_date_jst}</td>
                    <td>{run.scheduled_for}</td>
                    <td>{run.run_id}</td>
                    <td>
                      {
                        { success: "成功", partial: "一部完了", fail: "失敗" }[
                          run.state
                        ]
                      }
                    </td>
                    <td>{run.observation_count}</td>
                    <td>{run.last_error ?? "なし"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>閲覧可能な収集履歴はありません。</Empty>
        )}
      </Panel>
      <Panel title="最新の完了収集の価格">
        <p>
          実行ID：{data.prices.run_id ?? "記録なし"} · 観測時刻 (UTC)：
          {data.prices.observed_at ?? "記録なし"}
        </p>
        <p>
          履歴は直近30回の完了収集が対象です。
          {data.prices.history_truncated
            ? "それ以前の収集があり、履歴は省略されています。"
            : "30回を超える履歴の省略はありません。"}{" "}
          初回確認・最終変更は保存された観測の時刻で、提供元の掲載開始日ではありません。条件の変更も最終変更に含みます。未確認は永続的な変更なしを意味しません。時刻はUTCです。
        </p>
        {data.prices.prices.length ? (
          <div
            className="table-wrap"
            role="region"
            aria-label="ハイレゾ最新価格"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    "見積識別子",
                    "GPU・商品名",
                    "GPU数",
                    "価格 (円)",
                    "単位",
                    "税区分",
                    "初回確認 (UTC)",
                    "最終変更 (UTC)",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.prices.prices.map((price) => (
                  <tr key={price.record_key}>
                    <td>{price.record_key}</td>
                    <td>{price.gpu_model}</td>
                    <td>{price.gpu_count ?? "未提供"}</td>
                    <td>{price.price_jpy ?? "未提供（無料ではありません）"}</td>
                    <td>{price.unit}</td>
                    <td>
                      {
                        { included: "税込", excluded: "税抜", unknown: "不明" }[
                          price.tax_status
                        ]
                      }
                    </td>
                    <td>{utc(price.first_seen)}</td>
                    <td>{utc(price.last_changed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>閲覧可能な価格はありません。</Empty>
        )}
      </Panel>
    </>
  );
}
