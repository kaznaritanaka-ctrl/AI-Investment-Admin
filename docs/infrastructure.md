# Cloudflare Infrastructure: read-only client

## 実装と取得経路

Browser → `GET /api/infrastructure` → Admin Worker Secret → 固定Cloudflare API。`src/infrastructure-targets.ts`はserver専用の固定対象で、MCPで確認したaccount/DB IDと3 Worker名・1 R2名を保持する。D1/R2 bindingではない。

`CLOUDFLARE_READ_TOKEN`をWorker Secretから読む。非secret変数`CF_ACCOUNT_ID`は`0f9bb71bb987011462a91596f7cc9e6f`との完全一致を要求する。tokenなし・account未設定/不一致では通信せず、nullを持つunavailable projectionを返す。別accountや任意リソースをbrowserから指定できない。

最大23リクエスト、同時4、共通deadline 10秒（queue・header・bodyを含む）、1応答256KiB。redirectを追わず、Cookie・browser Authorizationを転送せず、再試行しない。429で未開始queueを抑制する。1項目の失敗で他を消さない。GraphQLの200 + errorsはその集計を無効にし、独立したmetadata/他リソースは残す。

Cloudflareは5分ごと、手動は60秒以上。公開statusは従来どおり60秒/手動5秒で、両系統は独立する。上流Retry-Afterをno-store応答に載せ、clientはauto/manual/表示復帰で尊重する。画面を閉じている間の常駐監視はしない。

## 固定APIとprojection

| 対象           | 固定API                                                                     | browserへ返す情報                                                  |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 Workers      | `GET /accounts/{account}/workers/scripts/{fixed-name}/script-settings`      | observability.enabledのみ。未提供nullはOFFと推定しない             |
| 同上           | `GET .../schedules`                                                         | cron文字列（UTC）                                                  |
| 同上           | `GET .../subdomain`                                                         | enabled / previews_enabled                                         |
| 同上           | `GET .../deployments`                                                       | 最新deploymentのcreated_on、version_idとpercentage。author等は除外 |
| Custom Domains | `GET /accounts/{account}/workers/domains`                                   | 対象3 Workers / productionのhostnameのみ                           |
| 2 D1           | `GET /accounts/{account}/d1/database/{fixed-id}?fields=uuid,name,file_size` | 固定名・file_size・取得状態。IDは検証のみ                          |
| evidence R2    | `GET /accounts/{account}/r2/buckets/ai-investment-evidence-private`         | 固定名・存在確認状態のみ                                           |
| Worker metrics | GraphQL `workersInvocationsAdaptive`                                        | requests/errors、CPU p50/p99（µs→ms）、最後のevent時刻             |
| D1 metrics     | GraphQL `d1AnalyticsAdaptiveGroups`                                         | rowsRead/rowsWritten・最後のevent時刻                              |
| R2 storage     | GraphQL `r2StorageAdaptiveGroups`                                           | 最新sampleのpayloadSize/metadataSize/objectCount・時刻             |
| R2 operations  | GraphQL `r2OperationsAdaptiveGroups`                                        | requests・最後のevent時刻                                          |

GraphQLは`POST /graphql`のstatic read queryのみ。user入力からクエリを組み立てない。SQL、D1 query/raw、R2 object list/body、Worker script content、Secret API、Logs本文は取得しない。Cloudflare version IDをGit SHAと同一とは扱わない。

metrics窓はサーバー時計の分境界までの直近24時間。集計とlatest-eventを別aliasで要求し、event行のlimitによる合計切捨てや分位点の平均を行わない。CPUはCloudflareのµsを1000で割ってmsにする。adaptive sampling・遅延・idleがあり、請求・全accountのFree枠使用率には換算しない。0はAPIが明示した場合のみ。空series / null / failureはUnknown。

projection取得から15分超はStale。R2 storage sampleが6時間超ならold_sample。Worker/D1の最終eventが古いことはidleでもあり、その古さだけでは障害や収集停止としない。

## 必要permission

2026-09-30に公式docsとMCPでendpoint/schemaを確認。**使用中のruntime tokenは以下4種類のみ。Workers Scripts Readを含めない。** 21:48 JSTに所有者が個別承認したaccount scope修正を行い、本番Adminを通じてmetadata・集計の実取得を確認した。MCP認証での成功とruntime tokenでの成功は別々に検証した。

| 目的                                    | 最小read権限・範囲                                                | 注意                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workers metadata/settings/observability | Workers **Metadata Read-Only**（対象3 Workersへ限定可能なら限定） | 旧UIのWorkers Tail Readが相当。Content Read-Only / Workers Scripts Readを選ばない                                           |
| Workers/D1/R2 GraphQL                   | **Account / Account Analytics / Read**                            | metadata権限だけで全dataset取得可とは仮定しない。対象accountに限定                                                          |
| D1 metadata/file_size                   | **Account / D1 / Read**                                           | 対象account。D1 row本文は実装で取得しない                                                                                   |
| R2 bucket metadata                      | **Account / Workers R2 Storage / Read**                           | 対象account。Admin Read onlyにはobject読取権も含むため、token自体はmetadata専用ではない。固定endpoint境界でobject取得を排除 |

対象accountは`0f9bb71bb987011462a91596f7cc9e6f`のみ。今回のaccount token `agent-token`は4権限が正しくても「指定ドメイン」scopeではWorker/D1/R2取得に失敗した。所有者の個別承認後、このaccountの「アカウント全体」へ変更して成功した。他accountやwriteへの範囲拡大はない。token自体のread権限はアプリが表示する固定リソースより広いため、固定endpointとprojectionの境界を維持する。将来Worker単位へ絞る案を採用する場合も各項目の取得可否を検証し、scopeを無断で変更しない。

### Metadataだけで読める項目と追加権限の候補

| UIの項目                                               | 現行REST docsのread permission       | 初期tokenでの扱い                                                                                                 |
| ------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Observability設定 (`script-settings`)                  | Workers Tail Readを許可              | Metadata相当で取得可能と文書上確認。APIのnullはUnknownのまま                                                      |
| workers.dev / preview URL (`subdomain`)                | Workers Tail Readを許可              | Metadata相当で取得可能と文書上確認                                                                                |
| 現行version / traffic / deployment日時 (`deployments`) | Workers Tail Readを許可              | Metadata相当で取得可能と文書上確認                                                                                |
| Cron (`schedules`)                                     | Workers Scripts Read / Writeのみ列挙 | 今回のaccount範囲の4権限tokenで実取得成功。Scripts Readの追加なし                                                  |
| Custom Domains (`workers/domains`)                     | Workers Scripts Read / Writeのみ列挙 | 今回のaccount範囲の4権限tokenで実取得成功。per-Worker scopeでの成功は未実証                                         |
| Worker CPU/requests/errors、D1/R2集計                  | Account Analytics Read               | Metadataだけで全GraphQL datasetを取得できるとは扱わない                                                           |
| D1 storage / R2 bucket存在                             | D1 Read / Workers R2 Storage Read    | WorkersのMetadata権限とは別                                                                                       |

CronとCustom Domainは今回4権限で実取得でき、Workers Scripts Readは不要だった。今後取得不能になってもOverviewと他の取得項目を継続する。401（認証）、429（制限）、timeout、nullを権限不足と決めつけない。必須欄にpermissionエラーが残ったときはscopeと権限を分けて調査し、必要性と影響が特定できた追加候補だけを別途所有者へ提示する。script内容のreadまで広がる権限を承認なしで追加しない。実測値と欠測欄は[本番反映記録](production-deployment-plan.md)。

DNS/Routes Edit、Access Edit、Workers Edit/Write、D1 Write、R2 Write、Secrets Write、API Tokens Writeは不要。Access継続監査とbilling subscription APIはruntimeに追加していないため、Access/Billing permissionも不要。今回のMCPはアプリtokenとは別の認証経路。

根拠： [Workers roles / scope](https://developers.cloudflare.com/workers/authorization/workers/)、[Script settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)、[Subdomain](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/get/)、[Deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)、[Schedules](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/)、[Custom Domains](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/)、[D1 metadata](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/)、[R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/)、[Account Analytics token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)。

## PlanとSecurity

`WORKERS_PLAN=free|paid`、`WORKERS_PLAN_VERIFIED_AT`（offset付きISO日時）、`WORKERS_PLAN_EVIDENCE`（1〜300文字）の3つが揃った場合のみmanual evidenceを表示する。未来時刻を拒否し、7日超はレビュー対象。APIでFreeが確認できたとは表示しない。未設定はUnknown。APIs repositoryの過去の値を自動コピーせず、subscription不在からFreeを推定しない。

Cloudflare AccessのWorker-boundアプリが本番入口を保護する。workers.dev / preview URLは無効のまま。Accessの継続監査/JWT独立検証は未実装なのでAccess保護は必須。加えて固定account/resource/endpoint、read-only credentials、projection、GET以外拒否、query拒否、別hostname/cross-site browser request拒否で権限と漏出面を制限する。Origin検査は認証の代替ではない。

tokenはWorker Secretのみ。VITE_、HTML、localStorage、console、診断コピー、raw JSONへ渡す経路を持たない。診断コピーは従来の公開API結果のみ。`InfrastructureSchema`が余分なfieldsをstripする。Cloudflareの失敗本文/例外message/headers、account ID/D1 ID、全accountのinventoryを返さない。no-store、nosniff、no-referrer、noindex、CSPを維持。CORS allow-originを付けない。DB/R2 bindingやwrite APIはない。

## 所有者の管理手順（再作成・再登録は現在不要）

現在は所有者によるtoken作成・Secret登録が完了し、承認済みversionが100%配信中。以下は将来の交換・再設定用手順で、今回もう一度行う必要はない。既存tokenのscopeだけを個別承認で修正し、値を取り直さず同じSecretで取得を確認した。

1. token作成、Secret登録、variable/設定反映、Admin deployは各操作の直前に所有者の承認を得る。ローカルの準備完了は本番操作の承認ではない。既存Access/Domainを作り直す必要はない。
2. 承認後、Dashboard **Manage Account → API Tokens → Create Token → Custom token** を開く。名前例`ai-investment-admin-readonly`。**Metadata Read-Only相当 / Account Analytics Read / D1 Read / Workers R2 Storage Read**のみを選ぶ。Workers Scripts Readは含めない。権限・scope・所有者が決めた期限を作成直前に確認する。
3. Account Resourcesを **Include → Specific account → `0f9bb71bb987011462a91596f7cc9e6f`** に限定。account-owned tokenのpolicyではこのaccountの「アカウント全体」を選ぶ。「指定ドメイン」は今回のmetadata取得範囲とは一致しない。TTLは所有者が決める。Global API key/Edit tokenを使わない。概要を確認して作成し、チャット・Git・ログ・ファイルへ値を貼らない。
4. 既存Secretの交換が必要な場合、所有者自身がWranglerの対話入力で`versions secret put CLOUDFLARE_READ_TOKEN`を使い、未公開versionを作る方法を優先する。値はSecret入力だけに入れ、コマンド引数・Codexへ渡さない。`secret put`やDashboard保存による即時反映と混同しない。version内容を確認後、本番切替を別途承認する。今回は所有者のSecretを継承済みで、再登録は不要。
5. 非secret変数 **`CF_ACCOUNT_ID`** は作業treeの`wrangler.jsonc vars`に記録し、承認済みversionへ反映済み。planの3変数は追加していない（Unknown維持）。必要なら所有者が現行Dashboardで確認し、別のレビュー済みvars差分として管理する。通常のdeployではGitにないText変数が削除され得るため、Dashboardだけに設定しない。Secretはvarsに記載しない。
6. `wrangler.jsonc`は既存Custom Domainのみを明示し、workers.dev/preview無効を維持する。本番Domain/Accessは変更していない。[本番反映記録](production-deployment-plan.md)でversion・差分・rollback・実行対象を確認し、次回の変更も実行直前に承認する。新しいDomain/DNS作成や付替えが必要な状態なら止めて再レビューする。
7. 承認後のdeploy後、Accessにログインして3ページを確認。403/429/空/nullがUnknownになり、他欄と公開APIは動くこと、未認証のHTML/assets/APIアクセスがAccessに保護されていることを確認する。

token作成・Secret入力は所有者自身が実施した。Codexは承認済みversion作成・本番切替と、別途承認された既存tokenのscope修正だけを実行した。token値取得・再発行・Secret再登録・DNS/Access/DB/R2変更はしていない。既存Overviewは接続設定がなくても利用できる。
