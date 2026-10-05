import type { RunDTO } from "./admin-contract.ts";
import { Empty, Timestamp } from "./console-ui.tsx";

const classification = {
  authentication: "認証・アクセス制限",
  rate_limit: "取得先のレート制限",
  transport: "通信・一時的な応答障害",
  response_contract: "HTTP応答の形式・サイズ",
  storage_or_publication: "保存・公開処理",
  schema_drift: "取得先のschema変更",
  unclassified: "未分類",
};
const evidence = {
  preserved: "保存済み（再解析の権利・内容確認が必要）",
  partial: "一部のみ保存",
  metadata_only: "診断情報のみ保存",
  not_captured: "保存されていません",
  unavailable: "保存状態を確認できません",
  expired: "期限切れ・再解析不可",
  not_reported: "記録なし・未確認",
};
const action = {
  none: "対応不要",
  none_yet: "処理の完了を確認",
  review_operational_alerts: "品質・設定・権利の注意事項を確認",
  confirm_source_semantics: "提供元の単位・意味・対象範囲を判断",
  review_repair_candidate: "診断から修正候補を作成・検証",
  evidence_unavailable_do_not_backfill: "Evidenceを確認。前日の値で補完しない",
  restore_read_access: "読み取り経路の障害を確認",
  investigate_collection_or_publication: "収集・公開の原因を調査",
  review_historical_state: "指定時点の履歴を確認",
};

export function RunRecovery({ run }: { run: RunDTO }) {
  const r = run.recovery;
  return (
    <section aria-label="障害・夜間対応" className="run-recovery">
      <h3>障害・夜間対応</h3>
      {!r ? (
        <Empty>
          障害診断は未取得です。診断がないことを正常とは判定しません。
        </Empty>
      ) : (
        <>
          <p>{r.briefing}</p>
          <div className="detail-grid">
            <dl>
              <dt>原因分類</dt>
              <dd>
                {r.classification ? classification[r.classification] : "未確認"}
              </dd>
              <dt>検出時刻</dt>
              <dd>
                <Timestamp value={r.detected_at} />
              </dd>
              <dt>発生段階</dt>
              <dd>{r.stage ?? "未確認"}</dd>
              <dt>診断コード</dt>
              <dd>{r.diagnostic_codes.join(", ") || "記録なし"}</dd>
              <dt>復旧用Evidence</dt>
              <dd>{evidence[r.evidence_state]}</dd>
              <dt>Evidence期限</dt>
              <dd>
                <Timestamp value={r.evidence_expires_at} />
              </dd>
            </dl>
            <dl>
              <dt>再試行</dt>
              <dd>{run.recovery_count ?? "未確認"} 回</dd>
              <dt>収集・公開の回復</dt>
              <dd>
                {r.recovery_result === "completed_after_failure"
                  ? "障害後の完了を記録済み"
                  : r.recovery_result === "not_needed"
                    ? "収集・公開完了"
                    : r.recovery_result === "in_progress"
                      ? "処理中"
                      : "未確認・未完了"}
              </dd>
              <dt>Dotsの調査・修正候補</dt>
              <dd>結果未連携・未報告</dd>
              <dt>回帰テスト・再解析</dt>
              <dd>結果未連携・未報告</dd>
              <dt>このrunの欠測</dt>
              <dd>
                {r.missing_observation === false
                  ? "なし（記録された取得範囲）"
                  : r.missing_observation === true
                    ? "あり"
                    : "未確認"}
              </dd>
              <dt>次の対応</dt>
              <dd>{action[r.remaining_human_action]}</dd>
            </dl>
          </div>
          <p className="small muted">
            調査やテストの完了だけでは、公開完了・欠測解消にはしません。
          </p>
        </>
      )}
    </section>
  );
}
