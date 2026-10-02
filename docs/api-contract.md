# 確認した公開APIとAdmin API契約

## 日常運用コックピット追加（2026-09-30）

既存`GET /api/status`のschema/path/取得・pollingは維持。追加は`GET /api/infrastructure`（no-store、GETのみ、queryなし）。形式は`admin-infrastructure-v1`。`fetched_at`、24hの`window`、`configuration`、`availability`、`workers`、`d1`、`r2`、`plan`のみを返す。各項目は`state / reason / http_status / retry_at`を持ち、失敗項目の値はnull。追加fieldのstripとUI検証は`src/infrastructure-contract.ts`で実施する。

tokenなしは200の`token_not_configured / unavailable`、account未設定・不一致は`account_not_configured`。部分失敗も200のprojectionで返し、429は各項目とRetry-After headerに反映。upstream raw response/headers/例外messageは返さない。固定endpoint・最小permission・owner設定手順は[infrastructure.md](infrastructure.md)。

Sourcesは既存public sourceのrights/version/coverage/limitationsとlive observationsを利用する。`enabled`、内部policyの現在状態、`valid_until`、review deadline、retentionは現行APIにないので未取得。future fieldを捏造せず、公開されていないsourceもrepositoryから埋め込まない。latest件数は応答内の最大100行という範囲を明記する。

日常のfreshnessはAPI stale情報と最新observed_atの36時間基準を使う追加表示。初回予定の判定ロジックはそのまま折りたたみ内に残す。unchanged priceは異常ではない。公開APIからwatchdog/continuation run結果は取得できず、Cronから成功を推定しない。

参照のみの追加確認：AI-Investment-APIsローカルHEAD `244af2b4d8097804463da28690dc8f5e7fcec314`の`src/api.ts`/`src/publication.ts`。以下は元の公開契約確認記録。

参照コミット：[25f4983158d11dafcac32b9c52ea3e3936d0f651](https://github.com/kaznaritanaka-ctrl/AI-Investment-APIs/tree/25f4983158d11dafcac32b9c52ea3e3936d0f651)（2026-09-30確認）。参照repoは変更していません。

読んだファイル：src/api.ts、src/collector.ts、src/schema.ts、src/publication.ts、src/openapi.ts、src/fx.ts、config/sources/ecb.json、config/sources/models_dev.json、wrangler.collector.jsonc。

| エンドポイント | 確認した構造と扱い |
|---|---|
| /health | status: no_public_data または public_data_available、datasets: [{dataset,count,last_observed_at}]、collector: {last_collector_completed_at,collection_enabled,monitor_connected} |
| /v1/latest | schema_version: "1", data: 観測配列。0件時は404 / error.code=no_observation。最新系列最大100行で、全履歴ではない |
| /v1/sources | schema_version: "1", data: 公開ソース情報。Collector全設定ではない |
| /v1/methodology/licenses | id: licenses, models_dev_mit: MIT全文 |

観測は source.source_id / observed_at / source_date / data_origin / dataset を持つ。FXは value.base_currency / quote_currency / rate_decimal、AIは value.model_id / price_components[] の component_type / amount_decimal / currency / unit。数値はdecimal文字列のまま表示する。publicObservationの出典・reuse条件・noticeを表示し、source情報やlicensesが失敗しても観測自身の条件を落とさない。

FXのUSD/JPYはreference_rate_type=project_calculationのAPI計算値。ECB自身が公表したクロスレートと表示しない。観測ID・元時刻・lineageなど追加metadataはJSON欄に保持する。JSONはメモリ内だけで、Cache-Control:no-store。

stale / stale_reason / quality_flags / fx_referenceはAPIの鮮度情報。元データ日付と取得時刻を混同せず、初動確認はecb/fxとmodels_dev/ai_api_pricesのlive観測についてobserved_at >= 2026-09-30T03:17:00+09:00で判定。健康状態の更新やsource掲載だけでは確認済みにしない。合成観測は実観測判定・価格表から除外する。

4エンドポイントは並列・個別に検証。成功した別欄は残し、失敗した欄の前回値は消す。4つの応答は原子的なDBスナップショットではないため、境界時刻に一時的に不一致となり得る。公開なしの断定はhealthがno_public_dataかつ空datasets、latestも空である場合だけ。

型を推測しないためZodで使用する構造を検証し、追加の公開metadataはpassthroughでJSON欄へ残す。サイズ上限は1応答2 MiB、最大100観測。10秒はヘッダだけでなく本文読み取りも対象。無効JSONやHTMLを正常データとして表示しない。

初回予定と03:17/03:47 JSTは参照設定に基づく静的な案内であり、本番設定を照会した結果ではない。private failure、R2保存、現行Cron、全モデル取得は確認できない。
