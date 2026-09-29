# AI Investment Research｜収集状況

初回Collector稼働の**公開結果だけ**を確認する、日本語の読み取り専用画面です。ブラウザ → 同じアプリのGET /api/status → 既存公開APIの順で読みます。Cloudflareログイン、APIトークン、DB、Dockerはローカル起動に不要です。

開発ブランチは **codex/wide-overview-layout**。mainへ未マージの場合、mainでgit pullするだけでは取得できません。

## ワイドディスプレイ前提の管理画面

個人用のワイドディスプレイを優先したOverviewです。左216pxの固定サイドバー、上部のstickyヘッダー、4つの小型ステータス、初回確認／Source Status、FX／AI API Pricesを横方向に配置します。1440px以上ではサイドバーを常時表示し、1920〜2560pxでもメイン領域の最大幅を狭く制限しません。主要情報をほぼスクロールせず確認できる密度にしています。

Overviewだけが実装済みです。Sources・API・Data・Logs・Settingsはdisabled表示で、空の画面には移動しません。1280px未満は列を折り返し、狭い画面でも最低限の表示を維持します。スマートフォン優先のレイアウトではありません。

初回予定までのカウントダウンを表示し、予定を過ぎても対象を翌日に移しません。AI価格はモデルごとにinput/outputを併記し、複数の条件はすべて残します。追加の価格区分や課金条件は「全価格区分・条件」で確認できます。異なる通貨・単位を合算・換算しません。

health.datasets・Raw JSON・Diagnosticsは通常閉じてあります。出典・ライセンス・診断コピーはDiagnostics内です。長い説明は各パネルの「i」から開けます。状態判定、公開API取得、60秒更新、Retry-After等の処理は従来と同じです。

## このPCで今すぐ起動

Windows PowerShellで、次を1つずつ実行してください。

~~~powershell
Set-Location "C:\Users\Tanaka\Documents\Codex\2026-09-27\kaznaritanaka-ctrl-ai-investment-apis-ai\outputs\AI-Investment-Admin"
~~~

~~~powershell
pnpm.cmd install --frozen-lockfile
~~~

~~~powershell
pnpm.cmd dev
~~~

ブラウザで **http://127.0.0.1:5173/** を開きます。PowerShellは開いたまま使います。ログイン・トークン入力はありません。サーバーは127.0.0.1だけで待ち受け、LANへ公開しません。

止めるには **Ctrl+C**。PowerShellを閉じるとローカルGUIは止まります。ブラウザのタブを閉じた場合も、このGUIは監視しません。**ローカルGUIを閉じても、Cloudflare Collectorは独立して動作し、そのCron設定は変わりません。**

5173が使用中なら既にこのアプリを起動しているターミナルがないか確認してください。別ポートへ自動変更しないためURLは固定です。

## 初めてcloneする場合

前提：Git、Node.js 24.19.0、pnpm 11.19.0。PowerShellの制約を避けるため、pnpm.cmd表記で実行します。

~~~powershell
node --version
~~~

~~~powershell
pnpm.cmd --version
~~~

~~~powershell
Set-Location "$env:USERPROFILE\Documents"
~~~

~~~powershell
git clone --branch codex/wide-overview-layout https://github.com/kaznaritanaka-ctrl/AI-Investment-Admin.git
~~~

~~~powershell
Set-Location ".\AI-Investment-Admin"
~~~

~~~powershell
pnpm.cmd install --frozen-lockfile
~~~

~~~powershell
pnpm.cmd dev
~~~

**http://127.0.0.1:5173/** を開きます。

## 更新するとき

起動中ならCtrl+Cで停止し、**実際のクローン先フォルダ**に移動してから以下を実行します。未マージの間は開発ブランチを更新します。

~~~powershell
git status --short
~~~

自分で変更したファイルが出た場合は、消さずに内容を確認してください。

~~~powershell
git switch codex/wide-overview-layout
~~~

~~~powershell
git pull --ff-only origin codex/wide-overview-layout
~~~

~~~powershell
pnpm.cmd install --frozen-lockfile
~~~

~~~powershell
pnpm.cmd dev
~~~

ブラウザの http://127.0.0.1:5173/ を再読み込みします。mainへのマージをPRで確認した後は、mainへ切り替え、mainをpullする方法に変更できます。

## 画面の見方

| 表示 | 意味 |
|---|---|
| 取得成功 | APIの応答を読めた。収集成功を意味しない |
| 実行報告未受信 | collection_enabled=0かつ最終処理記録=null。現在停止中とは断定しない |
| Collectorの最終処理記録 | watchdogや補助処理でも更新され得る。最終収集成功時刻ではない |
| 最終記録では有効 | public DBのcollection_enabled=1。現在のCloudflareスイッチの直接確認ではない |
| まだ未確認／未取得 | 公開観測がまだ確認できない。no_public_data・空datasets・latestの404 no_observationは初動前の正常な空状態 |
| 古い観測のみ | 対象ソースのobserved_atが初回予定より前。ECBのsource_dateが前日という理由だけではこう判定しない |
| 公開観測確認済み | 対象のsource_id・datasetに一致するlive観測を初回予定以降に1件以上確認 |
| 一部確認済み | ECB、Models.devの片方を確認 |
| 対象2ソースの公開観測を確認 | 両ソースを各1件以上確認。全モデル・全項目の完全取得やR2保存の確認ではない |
| 要確認 | 予定から15分以上経っても対象観測が未確認。原因を断定しない |
| 取得エラー／判定できない | 接続失敗、429、5xx、形式不正等。失敗した欄の前回値は消し、正常取得した別欄は残す |

初回対象は **2026-09-30 03:17 JST** で固定し、翌日へ自動変更しません。日次03:17、watchdog03:47 JSTは設定に基づく参考予定で、Cloudflareの現行設定を照会した結果ではありません。

最初に取得し、その後60秒ごとに更新します。「今すぐ更新」は読み直しだけで、収集を実行しません。重複・5秒以内の連打を防止し、429のRetry-Afterを優先します。自動更新OFFも使えます。非表示タブでは自動取得を停止し、表示復帰時に待機時間を守って再取得します。上流のタイムアウトは本文読み取りも含め10秒、画面側は12秒です。

時刻はJST、元の時刻文字列はJSON欄に表示。観測値はメモリ内だけで扱い、localStorage・Service Worker・CDNキャッシュには保存しません。診断コピー操作はクリップボードへ現在の確認結果を出します。

FX・価格のdecimal文字列はそのまま表示。nullや欠けた項目は「未提供」で、0や架空の価格・モデル名に補完しません。

**公開中の観測件数（API集計）**はhealth.datasetsのcountです。今日の収集件数・DB全件数・R2保存件数ではありません。latestは最大100系列で、全履歴の監査には使えません。

monitor_connected=0は「外部監視未接続」です。このGUIの作成で監視接続済みに変更していません。

## このGUIでは分からないもの

private側の失敗理由、R2保存結果、全モデル取得完了、Cloudflareの現在のCron・スイッチ・プラン・Access設定。Collector実行・停止・再実行、編集・削除、SQL、Cloudflare管理API接続はありません。DB/R2のIDやSecretsも不要です。

出典・取得範囲・制約・利用条件・MIT通知は「Diagnostics」で確認できます。Models.devは二次カタログ、USD/JPYの計算値はECB公表クロスではありません。契約と参照コミットは [docs/api-contract.md](docs/api-contract.md) に記録しています。

## 開発・検証

AI-Investment-Adminフォルダ内で実行します。通常のcheck・test・buildは本番APIへ通信しません。

~~~powershell
pnpm.cmd check
~~~

~~~powershell
pnpm.cmd test
~~~

~~~powershell
pnpm.cmd build
~~~

buildはローカル生成だけで、Cloudflareへアップロードしません。

WindowsにEdgeがある場合のブラウザテスト：

~~~powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
~~~

~~~powershell
pnpm.cmd test:browser
~~~

Chromiumを使う場合は、PLAYWRIGHT_CHANNELを未設定にし、先に次を実行します。

~~~powershell
pnpm.cmd exec playwright install chromium
~~~

合成データはtests内に限定し、ブラウザテスト時だけ/api/statusを置き換えます。スクリーンショットはwork/screenshotsへ出ます（合成データ、Git対象外）。

実公開APIの疎通は明示的な別コマンドです。固定4エンドポイントを各1回GETし、CollectorやDBには書き込みません。生の価格レスポンスをファイル保存しません。

~~~powershell
pnpm.cmd smoke:live
~~~

dev・previewの画面を開くと、画面の動作として本番公開APIへGETします。previewはbuild後に次で起動し、**http://127.0.0.1:4173/** を開きます。

~~~powershell
pnpm.cmd preview
~~~

Node 24.19.0 / pnpm 11.19.0で検証。Vite 8.3.1、Cloudflare Vite plugin 1.62.0、Wrangler 4.143.0、React 19.3.0を固定し、lockfileを含めています。pluginのpeer条件（Vite ^8、Wrangler ^4.143.0）を確認済み。ローカルpnpmストア.pnpm-storeはGit対象外です。

CIも型検査・合成テスト・build・ブラウザテストだけで、live smoke・Cron・デプロイは実行しません。

## Cloudflare配置手順（今回は未実施）

初期設定：Worker名 **ai-investment-admin**、workers_dev=false、preview_urls=false、routes=[]。D1、R2、Secrets、サービスbinding、Cronなし。候補ドメインadmin.ai-investment-research.netは未公開。**Accessは未設定・未検証です。**

公開承認後にだけ、次の順番で作業します。

1. Cloudflare Zero TrustのAccessに自己ホスト型アプリを作り、admin.ai-investment-research.net **全体**を対象にする。/apiだけに限定せず、HTML・/assets/*・/api/*をすべて保護する。
2. 本人のメールアドレス／IDだけのAllow条件を設定。Everyone・Bypassを作らない。認証方式・プランは所有者が確認する。未確認のAccount ID等をrepoに推測記入しない。
3. 別のsubdomain、Workers Buildsの自動preview、workers.dev等の迂回公開がないことを確認する。
4. Adminのwrangler.jsoncだけでroutesへ { "pattern": "admin.ai-investment-research.net", "custom_domain": true } を追加する案をレビュー。workers_devとpreview_urlsはfalseのまま。API/Collector側には変更を加えない。
5. check、test、build、下記dry-runを実行する。
6. Access保護設定と公開承認が揃ってから、正しいCloudflareアカウントでログイン・whoami確認し、Adminだけをデプロイする。custom domainのDNS登録が発生し得るため、今回は実行しない。
7. 公開後、本人は表示でき、ログアウト／シークレットウィンドウや別ユーザーではHTML・実際の/assetsファイル・/api/statusを取得できないことを各々確認する。workers.devとpreview URLも迂回できないことを確認する。Access未設定を保護済みと扱わない。

配置前のローカル検証：

~~~powershell
pnpm.cmd exec wrangler deploy --dry-run --config dist/ai_investment_admin/wrangler.json
~~~

**承認・Access設定後だけ**実行するコマンド：

~~~powershell
pnpm.cmd exec wrangler login
~~~

~~~powershell
pnpm.cmd exec wrangler whoami
~~~

~~~powershell
pnpm.cmd exec wrangler deploy --config dist/ai_investment_admin/wrangler.json
~~~

このアプリは追加のデータ保存基盤や常駐監視を使いません。通常、開いている1画面あたり60秒ごとに上流4 GETです。通信・Workerの利用量は発生し得ますが、有料契約は作成していません。

公式資料：[Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)、[Static Assets](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/)、[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)、[ViteのNode要件](https://vite.dev/guide/)。

実施結果は [docs/verification.md](docs/verification.md) に記録します。
