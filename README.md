# AI Investment Research Admin

AI-Investment-APIsの収集・公開・基盤を確認する、Cloudflare Access保護下の読み取り専用管理画面です。本番は https://admin.ai-investment-research.net 。再収集・設定変更・権利変更の操作はありません。

2026-10-04に承認済みのOverview整理と詳細ページを配信済みです。稼働version 51e3f59d-1586-4507-8370-fdca8823e9f4、Git commit 97277dee49f888c69e54cef72e8566d1d432ef73、tree 892d6b742c536e35c9e7f4b48e9aae3e856b9bbd。14:54 JSTのCloudflare照合でも100%配信、private台帳5件と一致しています。[機能・保全記録](docs/operations-pages.md)と[配信manifest](docs/releases/20261004-admin.json)を参照してください。配信時の成果物一致と今回のsource tree確認は、別環境の再ビルド一致と区別します。

本番commitはローカル codex/preserve-production-20261004 に保存し、資料修正は codex/operations-acceptance-20261004 です。従来originはローカルrepo、GitHubはgithub remote。Netlifyの自動公開対象を確認できなかったため、所有者指定でpush・PRを保留しています。古いGitHub mainで本番を上書きしません。

## 画面と取得

| ページ | 内容 |
|---|---|
| Overview | 要約4枚、要確認5件、ソース簡易表6件、全件へのリンク |
| Sources | 全ソース、内部実効設定・DBとの照合、他ページへの入口 |
| Runs | 予定/開始/終了、件数・エラー、watchdog/continuation、公開と通知。初回確認は履歴 |
| Data | 種類別の完全snapshot・履歴・差分・訂正・品質・系譜・詳細JSON。50件ずつページ送り |
| Infrastructure | Worker CPU、D1/R2、Cron/domain/version、折りたたみのAPI診断 |
| Releases | Cloudflareの稼働version、台帳のSHA、配信/検証/migration履歴 |
| Rights | 9目的の許可、現在の利用可否、内部再確認期限、条件・出典・保持 |
| Settings | 実効設定、停止/有効、取得範囲・保持・通知/認証設定の有無 |

ブラウザはGET /api/overview|sources|runs|data|releases|rights|settingsを通じ、ADMIN_READ Service binding→Collector#AdminReadの必要な投影を読みます。AdminにD1/R2 bindingはありません。Infrastructureは既存Secretによる固定Cloudflare metadata GET/GraphQL、/api/statusは公開APIの固定GETによる診断です。token、任意SQL/URL、Cloudflare raw responseをclientへ渡しません。非公開値は現在policyと保持期限を満たすものだけです。

JSTを基本にUTCも確認可能。観測・公表対象日・記録・公開の日時、収集・公開・通知の状態を分けます。未取得・取得エラー・記録なし・対象外を区別し、nullを0にしません。last_collector_completed_atはidleでも進むため観測成功の根拠にせず、価格不変だけで異常にしません。

Overview/Runsは表示中60秒、構成5分、Data手動更新。非表示ページの取得停止、深いリンク/戻る、モバイルを対応しています。Cloudflare metricsは直近24時間のadaptive集計です。Cron設定やHTTP成功・platform errors=0だけで業務成功を推測しません。

## ローカル起動

Node 24以降 / pnpm 11.19.0。

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

http://127.0.0.1:5173/ を開きます。ログインやCloudflare tokenは不要です。Secret未設定時はInfrastructureに **Cloudflare metrics unavailable** と表示し、既存Overviewはそのまま動きます。起動した画面は既存公開APIをGETします。終了はCtrl+C。ローカル画面を閉じても本番CollectorのCronは変わりません。

## 検証

```powershell
pnpm.cmd check
pnpm.cmd test
pnpm.cmd build
pnpm.cmd test:browser
pnpm.cmd deploy:dry-run
```

通常のテスト・buildは本番APIへアクセスしません。synthetic fixtureは`tests/`だけです。ブラウザテストは専用localhost:5174でAdmin endpointをfixtureに差し替え、通常の5173サーバーを再利用しません。WindowsでEdgeを使う場合は`$env:PLAYWRIGHT_CHANNEL='msedge'`。Wranglerのローカルログ・registryへの書込みが制限された環境では`XDG_CONFIG_HOME`と`WRANGLER_LOG_PATH`を`work/`内へ指定できます。

本番APIを読む既存の`pnpm.cmd smoke:live`、新しい`pnpm.cmd smoke:infrastructure --allow-network`は**明示opt-inの別コマンド**です。CIには含めません。後者は承認済みread-only tokenとaccount設定をプロセス環境から読み、ログには件数・状態だけを出します。今回このCLIへtokenを渡していません。live確認は本番Adminの既存Worker Secretを使う画面表示と、未認証HTTPのAccess転送確認で行いました。

[検証記録](docs/verification.md)に結果とsynthetic screenshotを記載しています。buildはローカル生成のみでdeployを行いません。

## 本番の接続状態と今後の設定変更

必要なpermissionとtoken/Secretの管理手順は[Cloudflare Infrastructure設計・設定手順](docs/infrastructure.md)にあります。現在の本番bindingはASSETS、CF_ACCOUNT_ID、CLOUDFLARE_READ_TOKEN Secret、ADMIN_READです。Secretは所有者が登録し、今回のversionにCloudflare内で継承しました。token値をCodexへ渡す必要はありません。

- 必須：`CLOUDFLARE_READ_TOKEN`（Worker Secret）、`CF_ACCOUNT_ID`（対象accountの非secret変数）。
- 任意：`WORKERS_PLAN`、`WORKERS_PLAN_VERIFIED_AT`、`WORKERS_PLAN_EVIDENCE`（確認済みplanのmanual evidence、API検証と区別）。
- 使用中の4権限：Workers **Metadata Read-Only** / Account Analytics Read / D1 Read / Workers R2 Storage Read。対象accountの「アカウント全体」に限定。Cron・Custom Domainを含め実取得でき、**Workers Scripts Readは追加していません**。
- 取得済み`origin/main`の`routes=[]`と本番Custom Domainのdriftに対し、作業treeの`wrangler.jsonc`は既存`admin.ai-investment-research.net`（`custom_domain: true`）、対象account、非secretの`CF_ACCOUNT_ID`を宣言しています。既存Domain/Access自体は変更していません。本番ソースはローカルcommit済みで、今回のGitHub push/PRは保留です。**今後のtoken・Secret・設定変更・deployにも、対象操作の所有者承認が必要です。**

現在のversionは[反映・保全記録](docs/operations-pages.md)、過去の配信手順は[歴史的配信計画](docs/production-deployment-plan.md)を参照してください。`pnpm.cmd build`の後に`pnpm.cmd deploy:dry-run`を実行します。dry-runはローカル検証で、token権限・Access実経路・本番CPUの検証ではありません。

現在の`workers_dev=false` / `preview_urls=false` / CSP等を維持します。Collector操作、source enable、private D1/R2 binding、DB/R2本文の取得、write、Secret値の取得、notification、deploy、migration、Access/DNS変更は実装していません。

契約の詳細：[公開APIとAdmin API契約](docs/api-contract.md)。

今回のAdmin差分は資料と配信metadataだけで、画面code・Access・binding変更なし、追加deployは不要です。API repoの docs/operations-acceptance.md にread-only checker、安全な通知有効化、復旧、7日間受け入れを集約しています。画面は閲覧口であり、独立した常時監視や通知送達を保証しません。GPU/電力の新しい実収集は対象外です。
