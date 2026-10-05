# 検証記録

## 承認済み本番切替・runtime実取得（2026-09-30 21:38〜21:49 JST）

本番Adminをversion `317f1afb-540c-43d8-9063-4c5b9d9fd648`へ100%切替。deploymentは`088fca27-5736-434e-bf92-4304c5b72eed`。事前/事後MCP GETで既存Custom Domain・Access・workers.dev/preview無効・Admin Cronなし・private bindingなしを確認した。

- 未認証のHTML、JS、CSS、`/api/status`、`/api/infrastructure`は全5パスで302 Access転送、private/no-store。
- 認証後のOverview / Sources / Infrastructureを確認。公開APIは成功し、ECB / Models.devは2/2 Healthy。公開APIの60秒更新とInfrastructureの5分更新・手動更新を実画面で観測した。
- 当初runtime tokenが「指定ドメイン」scopeだったためCloudflare欄がunavailableになったが、公開APIは継続。所有者の個別承認後に同じ対象accountの「アカウント全体」へ修正し、4つのread-only権限を維持した。
- 21:48:55 JSTの本番Admin snapshotで3 Workersのversion/Cron/Domain/exposure/requests/errors/CPU、2 D1のstorage/rows、evidence R2のstorage/operationsを実取得。Workers Scripts Readは追加せず、token値取得・再発行・Secret再登録もしなかった。
- Workers plan、ObservabilityのON/OFF、watchdog/continuation詳細、rights/retention期限は引き続き未取得。nullを0にせず、24h集計をFree枠使用率や新versionだけの性能と扱わない。

コード・生成物は準備時から変更していない。下記71 tests / 15 browser tests・check・build・dry-runの結果を再利用し、今回再実行したとは報告しない。今回のlive screenshotはブラウザツールで確認し、以下のsynthetic画像とは区別した。詳細・測定値・rollbackは[本番反映記録](production-deployment-plan.md)。CLIへtokenを渡す`smoke:infrastructure`は実行していない。

以下の準備・初期実装セクションは**当時の記録**。「未実行・未確認」は現在の本番状態ではない。

## 本番接続・deploy準備の再検証（2026-09-30 JST）

既存Phase 1を維持し、Wranglerに既存Admin Custom Domain・対象account・non-secret CF_ACCOUNT_IDのローカル案を追加。初期tokenのpermission案はMetadata Read-Only相当を採用し、Workers Scripts Readを初めから含めない。実行・rollback・承認手順は[本番反映計画](production-deployment-plan.md)に記録した。

| コマンド                  | 再実行結果                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm.cmd check`          | 成功                                                                                            |
| `pnpm.cmd test`           | **71件 / 6ファイル成功**                                                                        |
| `pnpm.cmd build`          | 成功。clientへの秘密・account/DB ID混入なし。対象account/Domain/varsの検査も成功                |
| `pnpm.cmd test:browser`   | Microsoft Edge **15件成功**（21秒）                                                             |
| `pnpm.cmd deploy:dry-run` | **成功、uploadなし**。Wrangler 4.143.0、204.15 KiB / gzip 46.33 KiB、ASSETS + CF_ACCOUNT_IDのみ |
| Wrangler types            | ローカル`work/deployment-env.d.ts`へ生成し、ASSETSとCF_ACCOUNT_IDの型を確認                     |

追加のsynthetic検証：CF_ACCOUNT_IDが設定済みでもtokenなしなら外部通信せずunavailable。Cron/Custom Domainsだけが403の場合にnull/Unknownを保ち、Observability・version・exposure・metrics・D1/R2の成功を残す。runtimeの取得処理や公開statusの実装は今回変更していない。

dry-run初回はWindows sandboxのディレクトリ読取り制限でesbuildが失敗。同じ`--dry-run`をローカル実行権限で再実行して成功。ブラウザテストは従来どおりlocalhost:5174のsynthetic fixtureのみを使用した。通常検証は本番APIに接続していない。

Cloudflare MCPのGETで19:36〜19:37 JSTに既存Admin version `a25fb401-53bf-442c-9489-4aa475afcd39` / 100%、Domain、workers.dev/preview無効、ASSETSだけのbinding、Worker-bound Accessのallow/email条件を再確認。19:48 JSTにAdminのCronが空であることも確認した。token作成・Secret登録・設定変更・deployは未実行。最小権限tokenのlive検証とdeploy後のAccess実経路確認は承認後に行う。APIs repositoryはHEAD `244af2b4d8097804463da28690dc8f5e7fcec314`、作業treeに変更なし。

## 日常運用コックピット（2026-09-30 JST）

`origin/main`をfetchして`5ed8eb6`を確認し、`codex/operations-cockpit`へ実装。今回の変更はAdminのみ。参照用APIsはHEAD `244af2b4d8097804463da28690dc8f5e7fcec314`、作業treeに変更なし。

| 検証                    | 結果                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd check`        | 成功                                                                                                                               |
| `pnpm.cmd test`         | **70件 / 6ファイル成功**（元の41件も維持）                                                                                         |
| `pnpm.cmd build`        | Worker + clientをローカル生成、成功。deployなし                                                                                    |
| build内のclient境界検査 | token binding名・Cloudflare API URL・account/D1 ID・synthetic sentinelの混入なし。D1/R2 binding、Cron、workers.dev/preview公開なし |
| `pnpm.cmd test:browser` | Microsoft Edge **15件成功**                                                                                                        |
| ワイド画面              | 1440×900 / 1920×1080 / 2560×1440、Overview空・観測ありで主要領域とページ全体がviewport内                                           |
| 新ページ                | Sources / Infrastructure切替、Unknown/null/部分403、stale、future nav disabled                                                     |
| 既存機能                | 初回固定予定、判定、decimal精度、複数条件、追加価格区分、empty/error、手動・auto更新、モバイル横崩れなしを維持                     |
| Cloudflare MCP          | 本番Admin / Domain / Accessをread-only確認。同等のWorker/D1/R2 aggregate query成功。新client tokenの動作検証とは別                 |

unit fixtureでtoken未設定、account不一致、成功、部分失敗、429/Retry-After、JSON/shape破損・サイズ制限、null/空series、Worker/D1/R2不在、古いstorage sample、画面stale、4並列/deadline、manual plan evidence、固定URL/HTTP method/security headers、secret非反射を検証した。新pollerの5分更新・60秒抑止・非表示/auto off・失敗時の値クリアも検証。

初回ブラウザ検証で1440pxの縦幅超過を検出し、行高・余白を修正して全件再実行した。Windows sandboxではローカルWrangler registryへの書込みとテスト子プロセスの終了に制限があり、`work/`内のXDG/logディレクトリとローカルテスト用の実行権限で検証した。通常開発用5173を再利用せず、専用5174を使用。本番通信を必要とするlive smokeは通常チェックから分離している。

UI screenshotは**syntheticのみ**（実データ/本番稼働の証拠ではない）。Git対象外の`work/screenshots/`に生成：

- `cockpit-overview-1440.png` / `cockpit-overview-1920.png`
- `cockpit-sources-1440.png` / `cockpit-sources-1920.png`
- `cockpit-infrastructure-1440.png` / `cockpit-infrastructure-1920.png`
- 従来検証の`wide-{1440,1920,2560}-{empty,observations}.png`

MCPの本番確認は[production-audit-20260930.md](production-audit-20260930.md)。新Admin Workerでのtoken認証・permission・Free plan CPUのlive検証は未実施。token作成/Secret登録、deploy、remote migration、Access/DNS/DB/R2変更を一切していない。Owner手順は[infrastructure.md](infrastructure.md)。

## 以下は初期実装・ワイドUI改修時の過去記録

以降の「未実施・未確認」は当時の状態。現在の本番Admin Custom Domain/Accessは上記MCP監査で確認済み。

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

| 対象                     | 確認結果                                          |
| ------------------------ | ------------------------------------------------- |
| /health                  | HTTP 200 / no_public_data / datasets=[]           |
| Collector最終処理記録    | null、collection_enabled=0（実行報告未受信）      |
| 外部監視の記録           | monitor_connected=0                               |
| /v1/latest               | HTTP 404 / no_observation（正常な空状態）         |
| /v1/sources              | HTTP 200 / 形式検証成功                           |
| /v1/methodology/licenses | HTTP 200 / 形式検証成功                           |
| localhost/api/status     | HTTP 200 / Cache-Control:no-store                 |
| ビルド済みHTML           | CSP適用、画面エラーなし、モバイルの横はみ出しなし |

この時刻は初回予定03:17 JSTより前です。**ECB・Models.devの実観測データを取得確認したとは報告しません。** healthの0/nullを現在停止中と断定していません。

取得した画面のスクリーンショットはローカルのwork/screenshots/live-empty-desktop.pngとlive-empty-mobile.pngです。これらは実公開APIによる空状態です。synthetic-*は合成データのテスト画面です。画像・生レスポンス・work配下はGitには含めません。

## 初期実装当時の未実施・未確認

- 初回予定03:17 JST以降の実観測公開確認。
- 本番Collectorの処理結果・private DB・R2保存・全項目取得。
- Adminの本番デプロイ、DNS、Cloudflare Access設定・保護確認。
- Cloudflareの現行Cron・プラン・スイッチの管理API照会。
- mainへのマージ。
- 常駐監視・通知・有料契約。

CIは公開APIに接続せず、静的検証・合成テスト・ビルドだけを行います。ローカル成功と本番稼働を分けて扱ってください。
