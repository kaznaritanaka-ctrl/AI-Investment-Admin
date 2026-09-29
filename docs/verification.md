# 検証記録

実施日：2026-09-30 JST。AI-Investment-Adminだけを変更。参照したAI-Investment-APIsは25f4983158d11dafcac32b9c52ea3e3936d0f651で、コード・設定・DB・Cronは変更していません。

## ワイド画面へのUI改修（2026-09-30 JST）

origin/main（ca3fe71）からcodex/wide-overview-layoutを作成し、表示・スタイル・ブラウザテスト・資料だけを変更しました。view-model・poller・network・Worker・契約・起動処理・Wrangler設定・依存関係に変更はありません。

- pnpm.cmd check：成功。
- pnpm.cmd test：41件、3ファイルすべて成功。
- pnpm.cmd test:browser（Microsoft Edge）：12件すべて成功。
- pnpm.cmd build：成功。ローカル生成のみ。
- 1440×900、1920×1080、2560×1440で空状態とデータ表示状態を確認。主要パネル全体がviewport内に収まり、ページの縦・横スクロールがないことを検証。多数の観測行はパネル内をスクロールできます。
- 左サイドバー幅、無効な未実装メニュー、折りたたまれた詳細、固定した初回予定のカウントダウン、複数の価格条件・異なる単位・null・追加価格区分の保持を検証。
- 既存の更新操作・部分失敗・データ消失・狭い画面・Worker拒否処理のテストも維持。

この改修の画面検証はすべて合成レスポンスです。work/screenshots/wide-*は合成データの画像で、Git対象外です。実ソースの収集成功や本番稼働を示すものではありません。以下の実API疎通結果は初期実装時の記録です。

## 初期実装時のローカル検証

- Node 24.19.0 / pnpm 11.19.0 / Windows PowerShell。
- pnpm.cmd install --frozen-lockfile：成功。依存のpeer条件を確認し、lockfileを固定。
- pnpm.cmd check：成功。
- pnpm.cmd test：41件、3ファイルすべて成功。
- pnpm.cmd test:browser（Microsoft Edge）：4件すべて成功。
- pnpm.cmd build：成功。Cloudflare Worker + Static Assetsを生成。
- Wrangler deploy --dry-run：成功。bindingはASSETSのみ、routesなし、workers_dev / preview_urlsはfalse。本番アップロードなし。
- git diff --check：成功。

自動テストは合成データだけをtests内で作成しています。初動前の空状態、404 no_observation、処理時刻だけの更新、ECBのみ、両ソース、古い観測、dataset/source不一致、syntheticの除外、UTC→JST、予定時刻と15分境界、null価格・decimal精度、HTMLエスケープを検証しました。

HTTP 302/403/404/429/500/503、Retry-After、timeout、不正JSON・schema、サイズ制限、部分失敗、任意URL/queryや書き込みメソッドの拒否、no-store、秘密ヘッダ非転送、連打・重複防止、非表示タブ、自動更新OFF、消えたデータを復活させないことも検証しました。

ブラウザでPC（1440px）・モバイル（390px）の表示、更新操作、詳細JSON、実Workerの拒否処理を確認しています。ブラウザ固有のfetch束縛、およびCloudflare runtimeがredirect:errorを受け付けない問題を実行時に検出・修正し、再検証しました。上流redirectはmanualとして3xxを拒否し、外部URLへ追従しません。

## 実公開APIの読み取り検証済み

別コマンドpnpm.cmd smoke:liveで固定4エンドポイントのGETを確認しました。さらにlocalhostのdev、および生成済みビルドを使うpreviewのブラウザから同一オリジン/api/status経由で取得できることを確認しました。

最後のブラウザ確認：**2026-09-30 00:55:50 JST**（2026-09-29T15:55:50.437Z）。

| 対象 | 確認結果 |
|---|---|
| /health | HTTP 200 / no_public_data / datasets=[] |
| Collector最終処理記録 | null、collection_enabled=0（実行報告未受信） |
| 外部監視の記録 | monitor_connected=0 |
| /v1/latest | HTTP 404 / no_observation（正常な空状態） |
| /v1/sources | HTTP 200 / 形式検証成功 |
| /v1/methodology/licenses | HTTP 200 / 形式検証成功 |
| localhost/api/status | HTTP 200 / Cache-Control:no-store |
| ビルド済みHTML | CSP適用、画面エラーなし、モバイルの横はみ出しなし |

この時刻は初回予定03:17 JSTより前です。**ECB・Models.devの実観測データを取得確認したとは報告しません。** healthの0/nullを現在停止中と断定していません。

取得した画面のスクリーンショットはローカルのwork/screenshots/live-empty-desktop.pngとlive-empty-mobile.pngです。これらは実公開APIによる空状態です。synthetic-*は合成データのテスト画面です。画像・生レスポンス・work配下はGitには含めません。

## 未実施・未確認

- 初回予定03:17 JST以降の実観測公開確認。
- 本番Collectorの処理結果・private DB・R2保存・全項目取得。
- Adminの本番デプロイ、DNS、Cloudflare Access設定・保護確認。
- Cloudflareの現行Cron・プラン・スイッチの管理API照会。
- mainへのマージ。
- 常駐監視・通知・有料契約。

CIは公開APIに接続せず、静的検証・合成テスト・ビルドだけを行います。ローカル成功と本番稼働を分けて扱ってください。
