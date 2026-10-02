# AI Investment Research Admin

AI-Investment-APIsの日常運用を確認する、個人用・**ワイドディスプレイ前提の管理画面**です。読み取り専用で、収集・設定変更の操作は提供しません。

本番Adminは **https://admin.ai-investment-research.net** にCustom Domainがあり、Cloudflare Accessで保護されています。**2026-09-30 21:38 JSTに承認済みコックピットversionへ100%切替済み**です。21:48 JSTに4つのread-only権限を持つruntime tokenの対象範囲を承認どおり修正し、Worker・D1・R2情報の実取得を確認しました。本番とGitの差分、残る未取得項目は[本番反映・検証記録](docs/production-deployment-plan.md)を参照してください。

作業ブランチ：`codex/operations-cockpit`。取得済み最新`origin/main`の`5ed8eb6`から作成（ワイドUIの`7a744ff`はmainへ統合済み）。AI-Investment-APIsは参照のみで変更していません。

## 画面

- **Overview**：8つのsummary、Source Status、Recent public data（FX・AI価格）、Infrastructure summary、Attention / Review。初回確認、health.datasets、Raw JSON、Diagnosticsは折りたたみ式です。
- **Sources**：公開APIのsource metadata、observed_at、source_date、latest応答内のlive観測件数、鮮度、公開rights/version、既知の制限。enabled/disabled・現在の内部policy・期限・retentionは現行公開APIで未提供なので「未取得」。未返却のGPU/OpenRouter等をrepository設定から推測しません。
- **Infrastructure**：対象3 Workers、private/public D1、evidence R2のmetadata・集計値。Cron、Custom Domains、version/traffic、Observability、workers.dev/preview URL、requests/errors/CPU、D1 storage/rows、R2 storage/operationsを確認します。
- Runs / Data / Releases / Rights / Settings：disabledの将来メニュー。架空のデータや空ページはありません。

左216pxの固定サイドバー、stickyヘッダー、暗色テーマを継承しています。1440×900・1920×1080・2560×1440を主対象にし、通常のOverviewは1画面内、行数の多い価格表はパネル内をスクロールします。狭い画面は折返しで対応します。

時刻はJST。価格はdecimal文字列を保持し、異なる通貨・課金単位を合算しません。複数のinput/output条件や追加区分は「全価格区分・条件」に残します。nullは0に変換しません。状態は色とHealthy / Warning / Unknownのラベルを併記します。

## 取得経路と表示の意味

```text
Browser → GET /api/status → 既存公開APIの固定4 GET
Browser → GET /api/infrastructure → Admin Worker Secret → 固定Cloudflare metadata GET / GraphQL query
```

ブラウザからCloudflare APIへ直接接続しません。token、account ID、D1 ID、Cloudflare raw responseをclient bundleへ入れません。DB・R2 bindingはASSETS以外に追加していません。

公開APIの60秒更新、手動更新、5秒の連打抑止、重複防止、非表示タブの停止、Retry-After、部分失敗時の表示は維持しています。Cloudflare情報は独立して5分更新し、手動更新は最短60秒です。上部の自動更新ON/OFF・手動更新は両系統に反映されますが、それぞれのcooldownを守ります。Infrastructureだけの更新ボタンもあります。

HTTP応答成功、Collectorの最終処理記録、live観測の鮮度は別々です。`last_collector_completed_at`を「最終データ更新」とは表示しません。価格差がなくても正常な再観測ならHealthyです。日常の鮮度はAPIのstaleと最新observed_atの36時間基準を併用し、初回予定以降の確認という旧判定は折りたたみ内に維持しています。

watchdog / continuationの実行結果・checkpointは公開APIで未提供です。Cloudflare Cronの存在、platform errors=0、処理記録だけから業務処理の成功を推測しません。権利期限・retention・review期限も取得できないため、Attentionへ確認範囲の不足として表示します。source_dateが前営業日でも観測時刻とは区別します。

Cloudflare metricsは対象リソースの**直近24時間**のadaptive集計です。account全体のFree枠、UTC日次使用率、R2月次課金量ではありません。Workerの最終eventが古いだけで障害とは判定しません。画面のprojectionが15分超、R2 storage sampleが6時間超なら古い表示として警告します。Workers planはOwnerが確認日時付きで登録したmanual evidenceのみ表示し、subscription不在からFreeを推定しません。

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

通常のテスト・buildは本番APIへアクセスしません。synthetic fixtureは`tests/`だけです。ブラウザテストは専用localhost:5174で両Admin endpointをfixtureに差し替え、通常の5173サーバーを再利用しません。WindowsでEdgeを使う場合は`$env:PLAYWRIGHT_CHANNEL='msedge'`。Wranglerのローカルログ・registryへの書込みが制限された環境では`XDG_CONFIG_HOME`と`WRANGLER_LOG_PATH`を`work/`内へ指定できます。

本番APIを読む既存の`pnpm.cmd smoke:live`、新しい`pnpm.cmd smoke:infrastructure --allow-network`は**明示opt-inの別コマンド**です。CIには含めません。後者は承認済みread-only tokenとaccount設定をプロセス環境から読み、ログには件数・状態だけを出します。今回このCLIへtokenを渡していません。live確認は本番Adminの既存Worker Secretを使う画面表示と、未認証HTTPのAccess転送確認で行いました。

[検証記録](docs/verification.md)に結果とsynthetic screenshotを記載しています。buildはローカル生成のみでdeployを行いません。

## 本番の接続状態と今後の設定変更

必要なpermissionとtoken/Secretの管理手順は[Cloudflare Infrastructure設計・設定手順](docs/infrastructure.md)にあります。現在の本番bindingはASSETS、非secretのCF_ACCOUNT_ID、CLOUDFLARE_READ_TOKEN Secretです。Secretは所有者が登録し、今回のversionにCloudflare内で継承しました。token値をCodexへ渡す必要はありません。

- 必須：`CLOUDFLARE_READ_TOKEN`（Worker Secret）、`CF_ACCOUNT_ID`（対象accountの非secret変数）。
- 任意：`WORKERS_PLAN`、`WORKERS_PLAN_VERIFIED_AT`、`WORKERS_PLAN_EVIDENCE`（確認済みplanのmanual evidence、API検証と区別）。
- 使用中の4権限：Workers **Metadata Read-Only** / Account Analytics Read / D1 Read / Workers R2 Storage Read。対象accountの「アカウント全体」に限定。Cron・Custom Domainを含め実取得でき、**Workers Scripts Readは追加していません**。
- 取得済み`origin/main`の`routes=[]`と本番Custom Domainのdriftに対し、作業treeの`wrangler.jsonc`は既存`admin.ai-investment-research.net`（`custom_domain: true`）、対象account、非secretの`CF_ACCOUNT_ID`を宣言しています。既存Domain/Access自体は変更していません。今回commit/push/mergeはしておらず、共有Gitとの差分は残ります。**今後のtoken・Secret・設定変更・deployにも、対象操作の所有者承認が必要です。**

現在の本番version、Custom Domain差分、deploy対象、dry-run結果、Secret/variable手順、rollback、deploy後の確認は[本番反映計画](docs/production-deployment-plan.md)を参照してください。`pnpm.cmd build`の後に`pnpm.cmd deploy:dry-run`を実行します。dry-runはローカル検証で、token権限・Access実経路・本番CPUの検証ではありません。

現在の`workers_dev=false` / `preview_urls=false` / CSP等を維持します。Collector操作、source enable、private D1/R2 binding、DB/R2本文の取得、write、Secret値の取得、notification、deploy、migration、Access/DNS変更は実装していません。

契約の詳細：[公開APIとAdmin API契約](docs/api-contract.md)。
