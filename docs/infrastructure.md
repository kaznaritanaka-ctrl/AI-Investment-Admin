# Cloudflare Infrastructure: read-only client

## 実装と取得経路

Browser → `GET /api/infrastructure` → Admin Worker Secret → 固定Cloudflare API。`src/infrastructure-targets.ts`はserver専用の固定対象で、MCPで確認したaccount/DB IDと3 Worker名・1 R2名を保持する。D1/R2 bindingではない。

`CLOUDFLARE_READ_TOKEN`をWorker Secretから読む。非secret変数`CF_ACCOUNT_ID`は`0f9bb71bb987011462a91596f7cc9e6f`との完全一致を要求する。tokenなし・account未設定/不一致では通信せず、nullを持つunavailable projectionを返す。別accountや任意リソースをbrowserから指定できない。

最大22リクエスト、同時4、共通deadline 10秒（queue・header・bodyを含む）、1応答256KiB。redirectを追わず、Cookie・browser Authorizationを転送せず、再試行しない。429で未開始queueを抑制する。1項目の失敗で他を消さない。GraphQLの200 + errorsはその集計を無効にし、独立したmetadata/他リソースは残す。

Cloudflareは5分ごと、手動は60秒以上。公開statusは従来どおり60秒/手動5秒で、両系統は独立する。上流Retry-Afterをno-store応答に載せ、clientはauto/manual/表示復帰で尊重する。画面を閉じている間の常駐監視はしない。

## 固定APIとprojection

| 対象           | 固定API                                                                     | browserへ返す情報                                                  |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 Workers      | `GET /accounts/{account}/workers/scripts/{fixed-name}/script-settings`      | observability.enabledのみ。未提供nullはOFFと推定しない             |
| 同上           | `GET .../schedules`                                                         | cron文字列（UTC）                                                  |
| 同上           | `GET .../subdomain`                                                         | enabled / previews_enabled                                         |
| 同上           | `GET .../deployments`                                                       | 最新deploymentのcreated_on、version_idとpercentage。author等は除外 |
| Custom Domains | `GET /accounts/{account}/workers/domains`                                   | 対象3 Workers / productionのhostnameのみ                           |
| D1 storage | GraphQL `d1StorageAdaptiveGroups` | 最新容量サンプルのdatabaseSizeBytes・採取時刻・取得状態 |
| Worker metrics | GraphQL `workersInvocationsAdaptive`                                        | requests/errors、CPU p50/p99（µs→ms）、最後のevent時刻             |
| D1 metrics     | GraphQL `d1AnalyticsAdaptiveGroups`                                         | rowsRead/rowsWritten・最後のevent時刻                              |
| R2 storage     | GraphQL `r2StorageAdaptiveGroups`                                           | 最新sampleのpayloadSize/metadataSize/objectCount・時刻             |
| R2 operations  | GraphQL `r2OperationsAdaptiveGroups`                                        | requests・最後のevent時刻                                          |

GraphQLは`POST /graphql`のstatic read queryのみ。user入力からクエリを組み立てない。SQL、D1 query/raw、R2 object list/body、Worker script content、Secret API、Logs本文は取得しない。Cloudflare version IDをGit SHAと同一とは扱わない。

metrics窓はサーバー時計の分境界までの直近24時間。集計とlatest-eventを別aliasで要求し、event行のlimitによる合計切捨てや分位点の平均を行わない。CPUはCloudflareのµsを1000で割ってmsにする。adaptive sampling・遅延・idleがあり、請求・全accountのFree枠使用率には換算しない。0はAPIが明示した場合のみ。空series / null / failureはUnknown。

projection取得から15分超はStale。D1 / R2 storage sampleが6時間超ならold_sample。Worker/D1の最終eventが古いことはidleでもあり、その古さだけでは障害や収集停止としない。

## 必要permission

現在のコード候補は Workers Metadata Read-Only（旧 Workers Tail Read）と Account Analytics Read の2種類を使用します。D1・R2は固定GraphQL集計だけに変更したため、D1 Read / Workers R2 Storage Read / object readは必要ありません。容量は遅延のあるAnalyticsサンプルであり、リソースの存在確認ではありません。空series、null、失敗はUnknownのままです。

これはコードの要求権限です。稼働tokenの権限変更・Secret交換・本番検証が済んだことを意味しません。Cron・Custom Domainを含む全項目を縮小後のtokenで確認し、403時にScripts Read等を自動追加しないでください。旧版へ戻す前には、その版が要求する権限との整合を確認します。

Workers metadataの固定GETにはWorkers Metadata Read-Only、D1/R2/Workersの固定GraphQLにはAccount Analytics Readを対応付けます。SQL・R2 object・Worker script本文は取得しません。個別の切替・復旧手順と実環境の証跡は非公開の運用記録で管理します。

## 権限確認の限界

script-settings / subdomain / deploymentsは公式REST仕様がMetadata相当（旧Workers Tail Read）を許可しています。schedules / workers/domainsの公式仕様はScripts Read / Writeを列挙していますが、過去のmetadataを含むread tokenではScripts Readなしで取得できました。今回の2権限構成での本番実測は切替時に行います。失敗時に権限を自動拡大しません。

APIの401・403・429・timeout・nullを区別し、scope不足とpermission不足を混同しません。Access/Billingやwrite権限はこのクライアントには不要です。

根拠：[Script settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)、[Subdomain](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/get/)、[Deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)、[Schedules](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/)、[Custom Domains](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/)、[Account Analytics](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)。

## PlanとSecurity

`WORKERS_PLAN=free|paid`、`WORKERS_PLAN_VERIFIED_AT`（offset付きISO日時）、`WORKERS_PLAN_EVIDENCE`（1〜300文字）の3つが揃った場合のみmanual evidenceを表示する。未来時刻を拒否し、7日超はレビュー対象。APIでFreeが確認できたとは表示しない。未設定はUnknown。APIs repositoryの過去の値を自動コピーせず、subscription不在からFreeを推定しない。

Cloudflare AccessのWorker-boundアプリが本番入口を保護する。workers.dev / preview URLは無効のまま。Accessの継続監査/JWT独立検証は未実装なのでAccess保護は必須。加えて固定account/resource/endpoint、read-only credentials、projection、GET以外拒否、query拒否、別hostname/cross-site browser request拒否で権限と漏出面を制限する。Origin検査は認証の代替ではない。

tokenはWorker Secretのみ。VITE_、HTML、localStorage、console、診断コピー、raw JSONへ渡す経路を持たない。診断コピーは従来の公開API結果のみ。`InfrastructureSchema`が余分なfieldsをstripする。Cloudflareの失敗本文/例外message/headers、account ID/D1 ID、全accountのinventoryを返さない。no-store、nosniff、no-referrer、noindex、CSPを維持。CORS allow-originを付けない。DB/R2 bindingやwrite APIはない。

## 権限を縮小する場合

コード・token scope・Secret交換・本番切替を別々に確認します。先にこのコードを既存権限で検証し、その後2権限のtokenに交換して全項目を確認する順序です。tokenの値はチャット・Git・ログ・fixtureへ渡しません。403や未取得はUnknownで表示し、権限拡大で解決したことにしません。

旧版のREST呼び出しを必要とするrollbackでは縮小tokenと互換でないため、容量欄がUnknownになることを許容するか、権限を戻す別承認が必要です。詳細な交換・復旧手順とaccount固有の記録は非公開で管理します。
