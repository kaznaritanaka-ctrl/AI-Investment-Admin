> 2026-09-30配信の歴史的記録です。現本番97277deは[現在の反映・保全記録](operations-pages.md)を参照してください。旧version/未登録を現在の設定へ戻す根拠にしません。

# Phase 1 Admin 本番接続・deploy計画

2026-09-30 21:49 JST更新。**所有者承認後、21:38 JSTに新コックピットへ100%切替済み。21:48 JSTにruntime tokenの対象範囲を別途承認どおり修正し、4つのread-only権限でCloudflare実データ取得を確認。** 対象は既存の`ai-investment-admin`。Phase 1の作業ブランチは`codex/operations-cockpit`、ベースは`5ed8eb6`。作業treeの未commit差分を含むため、HEADだけでは今回の成果物を指さない。配信versionと操作履歴は§6、live結果は§9を参照。

## 1. 初回調査時の本番記録（履歴、Cloudflare MCP / GETのみ）

確認日時：**2026-09-30 19:36:42〜19:37:28 JST**。

同日19:48:26 JSTの追加GET確認で、AdminのCronは`[]`。ローカル案にもCronを追加していない。

| 項目                      | 確認した本番値                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Account                   | `0f9bb71bb987011462a91596f7cc9e6f`                                                                              |
| Worker                    | `ai-investment-admin`                                                                                           |
| 現行version ID / traffic  | **`a25fb401-53bf-442c-9489-4aa475afcd39` / 100%**                                                               |
| 現行deployment ID         | `0a1d6a4a-10c4-4f6c-8b7a-7527a5c52598`                                                                          |
| deployment作成日時        | `2026-09-29T16:48:46.586202Z`（2026-09-30 01:48:46 JST）                                                        |
| Custom Domain             | `admin.ai-investment-research.net` → `ai-investment-admin` / production                                         |
| workers.dev / preview URL | 両方false                                                                                                       |
| compatibility_date        | `2026-09-29`                                                                                                    |
| binding名・種別           | `ASSETS` / assetsのみ。read token Secret・CF_ACCOUNT_IDは未登録                                                 |
| Observability             | APIの値はnull。無効と断定しない。Gitの既存`enabled:false`は維持                                                 |
| Access                    | Worker tag `8f6e87449e6c43a5b22b479c4a7505fc`を対象とするself_hosted app `236cac25-1ca0-4ba9-b780-6e35b0679b51` |
| Access policy             | `c1b00eb0-ffe1-4a80-b8c7-0806c500d714`、allow、email条件。email値は記録しない。bypass/everyoneなし              |

MCPでの設定確認と、未認証HTTP・認証済みブラウザを使う実経路検証は別。後者の今回の結果は§9。本番versionはSecret登録や別作業でも変わるため、各本番操作の直前に再読取りする。基準点が変わったら新しい差分を説明して再承認する。

## 2. 初期tokenの最小権限案

| 初期permission                     | 使用先                                                                   | scope                                                   |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Workers **Metadata Read-Only相当** | Observability設定、workers.dev/preview、現行version                      | 対象account。可能ならCollector/API/Adminの3 Workersだけ |
| Account Analytics **Read**         | Workers requests/errors/CPU、D1 rows、R2 storage/operationsのGraphQL集計 | 対象accountのみ                                         |
| D1 **Read**                        | 既存2 D1のmetadata/file_size                                             | 対象accountのみ                                         |
| Workers R2 Storage **Read**        | evidence bucket metadata                                                 | 対象accountのみ                                         |

初期tokenに**Workers Scripts Readを付与しない**。旧permission UIではWorkers Tail ReadがMetadata相当。旧permissionはaccount単位なので、3 Workersへ限定できる新roleが使える場合はそちらを選ぶ。Account Analytics等のaccount権限は、アプリの固定リソースprojectionより広い情報を読む能力がある。D1/R2のReadも本文を読む能力まで含み得るため、token自体をmetadata専用とは呼ばない。実装はSQL・object・script content・Secret API・ログ本文を呼ばない。

**Metadataだけで文書上取得可能：** `script-settings`のObservability、`subdomain`のworkers.dev/preview、`deployments`のversion・traffic・作成時刻。各RESTのAccepted PermissionsにWorkers Tail Readが含まれる。GraphQL集計、D1/R2 metadataは上表の別権限を使う。今回の4権限tokenでmetadata取得成功を実証済み。Observabilityの値はnullで、ON/OFFは未取得のまま。

**事前に追加権限の候補として調査した欄：** Cronの`GET .../schedules`とCustom Domainの`GET .../workers/domains`。REST資料のlegacy read権限にはWorkers Scripts Readだけが列挙されていたが、**今回のaccount範囲の4権限tokenでは両方とも取得成功。Workers Scripts Readは追加不要で、付与していない。** 将来permissionエラーが出た場合もscopeと権限を分けて確認し、追加を自動実行しない。401/429/timeout/nullは権限追加の根拠にしない。

権限表と一次資料へのリンクは[infrastructure.md](infrastructure.md#必要permission)。新runtime tokenにWorkers/Routes/DNS/Access/DB/R2のWrite、Billing、API Tokens Writeは不要。deploy用の所有者認証とruntimeのread tokenは別で、read tokenをWranglerのdeploy credentialに使わない。

## 3. Wranglerのローカル差分案

本番DomainをGitから再現するための差分。既存Domainそのものは変更せず、承認済みversionへ`CF_ACCOUNT_ID`とコードを反映した。

```diff
  "name": "ai-investment-admin",
+ "account_id": "0f9bb71bb987011462a91596f7cc9e6f",
  "workers_dev": false,
  "preview_urls": false,
- "routes": [],
+ "routes": [
+   { "pattern": "admin.ai-investment-research.net", "custom_domain": true }
+ ],
+ "vars": {
+   "CF_ACCOUNT_ID": "0f9bb71bb987011462a91596f7cc9e6f"
+ },
```

`CF_ACCOUNT_ID`はnon-secretのserver variable。`CLOUDFLARE_READ_TOKEN`はSecretだけで管理し、vars/ファイルに値を書かない。planのmanual evidence変数は未設定のまま。account_idはdeploy先の誤選択も防ぐ。[Custom Domainの公式形式](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)に従い、既存hostnameにwildcardや別routeを追加しない。

取得済み`origin/main`には旧`routes=[]`が残るが、作業treeの設定は既存本番Domainと一致する。CF_ACCOUNT_IDと新コックピットは本番反映済み。今回の切替はdeployment APIだけを使用し、Domain・DNS・Accessを変更していない。commit/push/mergeは今回未実行で、Gitの共有先とのdriftは残る。今後WranglerがDomain/DNSの置換・削除を求めた場合も自動承認しない。`workers_dev=false` / `preview_urls=false`、CSP、read-only、既存Observability設定を維持する。

## 4. deploy対象と検証済み成果物

deployするWorkerは**Adminだけ**。APIs/Collector repository、D1/R2 schema、Cron、Access policyは対象外。

| 元ファイル                                                                         | build/deploy対象                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/worker.ts`、`src/infrastructure*.ts`、既存`src/network.ts`等                  | `dist/ai_investment_admin/index.js`（server）                 |
| `src/Dashboard.tsx`、`src/Operations.tsx`、`src/main.tsx`、表示モデル・poller・CSS | `dist/client/index.html`、`dist/client/assets/*.js` / `*.css` |
| `public/_headers`、`public/favicon.svg`                                            | `dist/client/_headers`、favicon                               |
| `wrangler.jsonc`、`vite.config.ts`                                                 | `dist/ai_investment_admin/wrangler.json`（deploy設定）        |

`src/infrastructure-targets.ts`のaccount/DB IDはserver専用。client bundleへ入らないことをbuild内で検査。README/docs/tests/scripts/work/node_modulesは静的配信対象ではない。設定の`assets.directory`は`dist/client`だけを指す。Secretは成果物に含めない。

今回のSHA-256（再build後は再確認し、変更があれば承認対象も更新する）：

| 生成物                     | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| server `index.js`          | `380da88da5aa3f9f579d281d39f84772de52d03765e19ab5e05f23d8964e06da` |
| generated `wrangler.json`  | `31291e83a824ef158823b564e910d2664c6b14ffb63f2b4a52647579afdbf201` |
| client `index-DG5g3G9W.js` | `52384d3102907a89a360a077b5d972cedc5ce6773cf8f7497cdf9914523537c1` |

## 5. 今回の検証結果

| コマンド                  | 結果                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm.cmd check`          | 成功                                                                                          |
| `pnpm.cmd test`           | **71件 / 6ファイル成功**                                                                      |
| `pnpm.cmd build`          | 成功、client秘密境界・対象account/Domain・binding検査成功                                     |
| `pnpm.cmd test:browser`   | Microsoft Edge **15件成功**、1440/1920/2560幅を含む                                           |
| `pnpm.cmd deploy:dry-run` | **Wrangler 4.143.0成功**。204.15 KiB / gzip 46.33 KiB。表示bindingはASSETSとCF_ACCOUNT_IDのみ |

準備時のdry-runの実体は次のコマンド。Viteが生成した設定を使用する。この検証コマンド自体はupload・本番変更を行わない。後続の承認済み反映は§6。

```powershell
pnpm.cmd build
pnpm.cmd deploy:dry-run
# package script:
# node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config dist/ai_investment_admin/wrangler.json --outdir work/deploy-dry-run
```

Windows sandboxではesbuildの親ディレクトリ読取りが拒否されたため、同じdry-runをローカル実行権限で再実行して成功した。browser testもローカル子プロセスの終了権限で実行。通常テストはsyntheticだけで、本番Cloudflare APIへ接続していない。Cron/Domainの403を模した部分成功と、CF_ACCOUNT_ID設定済み・tokenなしの無通信fallbackを検証した。新tokenでのpermission、実Cloudflare集計、本番CPU、Access実経路の成功を示す結果ではない。

## 6. version作成と承認済み本番切替の記録

所有者がtokenをDashboardで作成し、自身の端末からSecretを登録した。token値はCodexへ渡さず、Git・ファイル・ログにも保存しない方針を維持する。MCPへのAccount API Tokens Write追加、token発行、Secret値の取得・再入力は行っていない。Secret登録の存在確認と、後述のtoken policy確認・live接続検証は区別する。

所有者の「未公開版の作成を承認。公開への切り替えはまだしない」に対する「OK進めて」を受け、2026-09-30 21:29:23 JSTに次のversionを作成した。

| 項目 | 確認結果 |
| --- | --- |
| 作成したコックピットversion | `317f1afb-540c-43d8-9063-4c5b9d9fd648`（version 4、21:29時点では未公開、21:38に100%配信へ切替） |
| 引継ぎ元の最新version | `9b71b28f-5346-430a-bed8-c71eef30f2a0`（所有者のSecret登録、20:41 JST作成） |
| 切替前に100%配信していたversion | `6dc22cef-93a1-40fa-b8b0-14794e784acf`（20:27 JST、Dashboard経由） |
| 切替前のdeployment | `0366a160-53b8-40dd-b500-19347e538c59` |
| 新versionのbindings | `ASSETS` / assets、`CF_ACCOUNT_ID` / plain_text、`CLOUDFLARE_READ_TOKEN` / secret_text |
| Account設定 | `CF_ACCOUNT_ID`が対象accountと一致 |
| private bindings | D1/R2 bindingなし |
| 新versionのscript etag | `9326bcf0156d63399646e208abbbe661ac46c1d8a5a52bc2e0073e93c4682b8b` |

実行したコマンド（成果物は§4の3ファイルのSHA-256と一致、コード変更なし）：

```powershell
$env:WRANGLER_WRITE_LOGS = "false"
$env:WRANGLER_LOG_SANITIZE = "true"
$env:WRANGLER_LOG = "log"
$env:WRANGLER_SEND_METRICS = "false"
$env:CI = "true"

node node_modules/wrangler/bin/wrangler.js versions upload --dry-run --config dist/ai_investment_admin/wrangler.json --name ai-investment-admin --message "Owner-approved Admin cockpit staging only; production traffic unchanged" --tag "admin-cockpit-phase1" --outdir work/versions-upload-dry-run
node node_modules/wrangler/bin/wrangler.js versions upload --config dist/ai_investment_admin/wrangler.json --name ai-investment-admin --message "Owner-approved Admin cockpit staging only; production traffic unchanged" --tag "admin-cockpit-phase1"
```

Wrangler 4.143.0のversions uploadは`keepSecrets: true`で既存SecretをCloudflare内で継承する。Secret値を取得する処理や`--secrets-file`は使用しない。新versionをGETし、Secretの名前・種別だけを再確認した。runtime read tokenをWrangler管理用認証には使っていない。

versions用dry-run成功：204.15 KiB / gzip 46.33 KiB。Windows sandboxの親ディレクトリ読取り制限に当たったため、同一dry-runをローカル実行権限で再実行して成功し、その後に承認済みuploadを実行した。uploadはstatic assets 3件とWorker versionの作成に成功。今回、§5のcheck/test/build/browserを再実行したとは扱わず、検証済み成果物を使用した。

21:27:56 JSTの直前確認と21:29:52 JSTの事後確認で、deployment ID・配信version/100%、Custom Domainの接続先、workers.dev/preview無効、Access app/policy ID・allow/email条件、Admin Cron `[]`の取得結果は同一。`versions deploy`と`triggers deploy`は実行していない。DNS・Access・Observability・API/Collector・D1/R2への変更操作も行っていない。

その後、所有者の**「進めてください」**による本番切替・live確認の承認を受けた。21:37:57 JSTのGETで切替前deployment・候補version・Domain・Accessを再確認し、21:38:22 JSTにCloudflare MCPから次のdeployment APIを実行した。非version設定を変更しないため、Wranglerのdeploy/triggers操作は使っていない。

```text
POST /accounts/{verified-account}/workers/scripts/ai-investment-admin/deployments
strategy: percentage
versions: [{ version_id: 317f1afb-540c-43d8-9063-4c5b9d9fd648, percentage: 100 }]
```

作成されたdeploymentは**`088fca27-5736-434e-bf92-4304c5b72eed`**。21:39:45 JSTのGETで対象versionの100%配信、binding名・種別とaccount一致を確認。既存Custom Domainの接続先、Access app/policyとallow/email条件、workers.dev/preview無効、Admin Cron `[]`は切替前と同一だった。API/Collector、D1/R2、Cron、DNS、Access policyは変更していない。[version作成と配信の分離](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/)を参照。

初回のInfrastructure取得ではmetadataが権限不足、GraphQLがquery失敗となった。所有者のDashboardセッションで既存account token `agent-token`のpolicyを確認し、4権限は正しい一方、対象が「指定ドメイン」だったことを確認。**「対象範囲の修正と再確認を承認」**という個別承認を受け、21:48 JSTに同じ対象accountの「アカウント全体」へ保存した。保存後に同じtokenのpolicyを開き直し、対象accountと4権限の維持を確認。IP制限・期限は変更していない。

tokenの値取得・再発行・Secret再登録・Workers Scripts Readやwrite権限の追加は行っていない。MCP認証も変更していない。21:48:55 JSTのAdmin再取得でWorker/D1/R2 metadataと集計の成功を確認した。既存Secretはそのまま使用している。

## 7. rollback

承認後のdeployで問題があれば、所有者に対象versionと影響を示して**rollback実行直前にも承認を得る**。今回のupload直前・直後に100%配信を確認した戻し先候補は`6dc22cef-93a1-40fa-b8b0-14794e784acf`。このversionには`ASSETS`と`CLOUDFLARE_READ_TOKEN`があり、`CF_ACCOUNT_ID`はない。Git SHAではなくCloudflare version IDを指定する。本番切替直前に別の更新が見つかった場合は戻し先も再確認する。

```powershell
# 所有者が対象を承認した後だけ実行する。今回未実行。
node node_modules/wrangler/bin/wrangler.js rollback 6dc22cef-93a1-40fa-b8b0-14794e784acf --name ai-investment-admin --config dist/ai_investment_admin/wrangler.json --message "Restore pre-cockpit Admin"
```

DashboardのWorker → Deployments → 対象version → Rollbackでも可能。指定versionへ100%を戻し、Domain/AccessとHTTP応答を再確認する。rollbackはCloudflareリソースの内容やtoken発行を元に戻す機能ではない。Secret/varsは対象versionの構成を確認し、tokenの失効・Secret削除を勝手に追加しない。旧versionでは新Infrastructureページがなくなる。

旧commitの`routes=[]`を再deployして戻さず、version rollbackを使って既存Domain接続を保持する。D1/R2の変更やmigration rollbackは不要。直近100公開versionなど[Cloudflareのrollback制約](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)を実行直前に確認する。

## 8. deploy後のread-only確認

1. deploymentのversion/100% traffic、`CF_ACCOUNT_ID`の設定、Secretの名前・種別、既存Custom Domainの対象、workers.dev/preview無効を確認。Secret値は読まない。API/Collectorのversion/CronやD1/R2 schemaを変更しない。
2. Access未認証でHTML、実在するJS/CSS asset、`/api/status`、`/api/infrastructure`がアプリ内容を返さずAccess認証を要求することを確認。Access認証後にOverview / Sources / Infrastructureが動くことを確認する。Access policyの変更はしない。
3. `/api/status`の契約、60秒更新、manual/auto off、429のRetry-Afterを維持。Collector処理記録とlive観測時刻、価格不変の再観測を混同しない。公開APIの読み取りが失敗してもCloudflare欄と分離されることを確認する。
4. `/api/infrastructure`はno-storeの最小projectionだけ。browser Network/HTML/JS/console/diagnostic copyにtoken、raw CF response、Worker source、D1 row、R2 object本文が出ない。5分更新・60秒manual制限を確認する。
5. 初期4権限で各欄のstate/reason/http_statusを確認。Cron・Domainの403はUnknown、残りの正常欄は表示。null/空sampleを0にしない。権限拡大を伴う追加対応は、必須の欠測欄を特定して別途承認する。Workers planはmanual evidence未設定ならUnknownのまま。
6. 反映後のAdmin requests/errors/CPU、timeout/429、metrics freshnessを観測する。数値はrolling 24hで旧version分が混ざり得るため、新versionの性能証明やFree枠残量と混同しない。データの遅延は追加権限や設定変更で埋めずUnknownを維持する。

live smokeは明示opt-inだけ。今回の承認済み実経路確認は次節に記録。CLIの`smoke:infrastructure`は実行せず、既存Worker Secretを使う本番画面で検証した。問題時は診断結果を最小projectionで記録し、Secret値・raw responseを保存しない。

## 9. 本番live検証（2026-09-30 21:39〜21:49 JST）

- 未認証GET：`/`、実在するJS/CSS asset、`/api/status`、`/api/infrastructure`の5パスすべてが302で既存Cloudflare Accessログインへ転送された。アプリ内容は返らず、応答はprivate/no-store。認証Cookieやredirect queryを取得・記録していない。
- 認証済み画面：Overview / Sources / Infrastructureを表示できた。公開APIは成功、ECB / Models.devは2/2 Healthy。ECBのlatest公開観測3件、Models.devは2件。最終observed_atはそれぞれ03:17:36 / 03:17:38 JST。Collector処理記録08:55:35 JSTとは別欄で表示する。
- 公開APIの60秒更新、Infrastructureの5分更新と手動更新を観測。token scope修正前のunavailableでも公開APIの更新は継続した。修正後の次回自動更新（21:53:57 JST）でも全対象の取得が成功し、requests・rows等の更新を確認した。
- token scope修正後の21:48:55 JSTのsnapshotで、3 Workersのmetadata/version/traffic、Cron、Custom Domains、workers.dev/preview、requests/errors/CPU、2 D1のstorage/rows、R2 bucket/storage/operationsを実取得。MCPの代替取得ではなく、本番Admin Workerが既存Secretで取得した結果をブラウザ表示から確認した。

同snapshotの表示値（集計窓は09/29 21:48〜09/30 21:48 JST、実測履歴の記録のみ。fixtureや初期表示には転記しない）：

| リソース | 直近24h requests / runtime errors | CPU p50 / p99 (ms) |
| --- | --- | --- |
| Collector | 78 / 0 | 2.866 / 363.684 |
| API | 1292 / 0 | 0.851 / 5.212 |
| Admin | 74 / 0 | 5.740 / 37.955 |

| リソース | storage表示 | 直近24h rows read / written またはoperations |
| --- | --- | --- |
| private D1 | 376 KiB | 7292 / 285 rows |
| public D1 | 160 KiB | 7287 / 145 rows |
| evidence R2 | payload 12.28 KiB / metadata 280 B、4 objects | 36 operations |

R2 storage sampleは21:10 JST。これらは対象リソースのrolling 24h値で、旧versionの処理も含む。新Admin versionだけのCPU性能や、Free plan日次/月次枠の消費率は証明しない。runtime errors=0からwatchdog/continuationの業務成功を推定しない。

残る未取得：Workers plan（manual evidence未設定）、3 WorkersのObservability ON/OFF（API値null）、watchdog/continuation詳細、sourceの内部policy/rights/retention期限。追加権限や推測値で埋めていない。Runs / Data / Releases / Rights / Settingsは引き続き未実装。

本番Infrastructureのscreenshotをブラウザツールで目視確認。`work/screenshots/`の既存画像はsyntheticのままで、本番画像へ置換していない。コード・生成物を変えず、§5のcheck/test/build/browser/dry-run検証済み成果物を配信したため、今回それらを再実行したとは扱わない。今回は本番接続・公開境界・既存機能のlive確認と本資料の更新を行った。
