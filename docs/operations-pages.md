# Overview整理と管理ページ

2026-10-04の所有者承認で本番Admin 97277de / version 51e3f59d-1586-4507-8370-fdca8823e9f4を100%配信済みです。Collectorはa534ff0 / version 764bb171-582b-47a0-ad40-5d6aadc61ee6、private 0005と台帳5件も反映・検証済みです。

| ページ | 内容 |
|---|---|
| Overview | 収集・公開・鮮度・要確認の4カード、注意事項5件、ソース6件。詳細へ条件付きで移動 |
| Sources | runtimeとDBの全ソース一覧、取得範囲、観測時刻、停止理由、関連ページ |
| Runs | 直近7日、予定・開始・終了・受入・隔離・エラー、checkpoint、取得試行、watchdog/continuation、公開・通知。固定した初回確認の旧ロジックは折りたたみ |
| Data | 最新の完全なsnapshot、期間・ソース・種類・項目検索、50件のページ送り、履歴・差分・訂正・品質、取得値/公開値、出典・条件、関連run/系譜、詳細JSON、公開件数 |
| Infrastructure | 既存Worker CPU・D1/R2・プラン・構成。公開API診断とコピーは折りたたみ内で取得 |
| Releases | Cloudflareの稼働versionと一致する台帳のSHA、配信履歴、検証、migration記録 |
| Rights | ソース×9目的、現行/履歴policy、利用可否、30日前/7日前/期限切れ、条件・根拠・保持 |
| Settings | Collector実効設定、DBとの一致、Cloudflare Cronとの一致、ソース・範囲・保持、通知/認証の設定有無 |

Overviewは価格や全履歴を取得しません。詳細ページを離れると取得を中断し、非表示時は更新を停止します。Overview/Runsは60秒、構成情報は5分、Dataは手動更新。ページ送りのcutoffは固定し、新しい更新で解除します。ソース・run・期間は互換性のある遷移先へ引き継ぎ、URLとブラウザの戻る/進むで復元できます。

JSTを標準とし、UTC切り替えと元UTCのツールチップを用意しました。価格は小数文字列を維持し、nullを0に変換しません。収集・公開・通知は独立して判定し、取得エラー・記録なし・未導入・未提供を区別します。固定した初回確認欄は旧判定ロジックによる参考表示で、現在の公開live観測から過去のrun全体の成功を断定しません。

モデルはモデル/provider/価格項目、GPUは機種・地域・契約/商品条件、電力は地域・期間・単位を中心に表示します。電力の本番adapter/0004はこのリリースには含まれず「未導入」です。GPU/電力の有効化や鍵の登録は行いません。非公開値はCollectorの現在の内部閲覧許可と保持期限を満たすものだけです。

新しいGETは /api/overview、/api/sources、/api/runs、/api/data、/api/releases、/api/rights、/api/settings。runs/dataは /:id も受け付けます。従来の /api/status と /api/infrastructure を保持します。Admin自体にD1/R2はbindせず、ADMIN_READ → ai-investment-collector#AdminRead のDTOだけを返します。既存Access、host/origin、GET-only、CSP、no-storeを維持します。

Releasesには確認済みの過去3件と今回のCollector/Admin、計5件を記録済みです。Cloudflareのversionと一致しないSHAを推測しません。台帳の更新機能は画面/APIにありません。Operatorの配信手順でハッシュ/commit/tree/検証を照合した追記だけを行います。

## 検証と反映

型・単体・ブラウザ・client bundle境界・Vite build・Wrangler dry-runを実施します。ブラウザは合成データのみで、4/5/6件の上限、125件のページ送り、失敗/未提供、リンク/戻る/JST/UTC、モバイル/キーボード、60秒更新・非表示停止、Data手動更新、GET-onlyを確認します。API側では読み取り入口、移行・不変条件、権利・保持・公開gate、runtime回帰を検証します。

ブラウザテストは専用5174を使います。Windowsの制限付き環境で開発サーバーの終了待ちに問題が出る場合は、別途5174のViteを起動し、PLAYWRIGHT_EXTERNAL_SERVER=true でテストを実行して、起動したサーバーだけを終了します。テストは外部HTTPを遮断し、synthetic画面を本番の検証結果として扱いません。

完了した反映順序は、private 0005 → CollectorのAdminRead → Adminのservice binding → 承認済み台帳追記です。それぞれ直前承認・検証済みです。公開APIの配信やpublic D1の変更は不要です。APIリポジトリの docs/admin-read.md に詳細と復旧手順があります。

## Git保全と今回の受け入れ確認

開始時のHEADは97277de、作業ツリーclean、worktreeは1つ。元branch codex/admin-operations-pagesと同commitをcodex/preserve-production-20261004で保持しました。originはローカルrepoで維持し、GitHubをgithub remoteとして追加。GitHub mainは5ed8eb6で、97277deはまだ取得不可でした。未公開4 commitの66変更blobとfixture/文書を確認し、credential候補1件は合成redaction値でした。実価格fixture、Secret、privateログの追加を確認しませんでした。

Cloudflare Builds triggerなし、Pagesなし、GitHub hooks/deployments各0、CIは検証のみ。ただしNetlify Appの対象repo範囲を表示するには再認証が必要で、所有者がpush保留を指定しました。両branchと今回の資料修正はローカルのみ、PR未作成。自動公開なしの確認と保留解除後に再検査して公開します。reset/clean/force-pushは行いません。

[manifest](releases/20261004-admin.json)、[evidence](releases/20261004-admin-evidence.json)、[成果物manifest](releases/20261004-admin-artifact-manifest.json)は配信時のものを変更せず複写。台帳artifact digestはmanifestの582bc8c7…、server単体は16185dc3…で別です。recordのevidence_refは当時workspaceの参照で、同名のevidenceを同ディレクトリへ保存しました。配信時のserver byte一致・client content-hash照合と、今回の稼働version/tree確認を区別し、今の再ビルドが同じbyteになるとは主張しません。Node24/pnpm11.19.0/lockfile/compatibility2026-09-29が条件です。

今回のAdminは資料/配信metadataだけの差分で、画面code・binding・Access変更なし。通知判定・未適用0006・dry-run・復旧検証はAPI repoの別commitで扱います。Adminの追加deployは不要です。元配信の合成browser検証と本番8ページGET/150件ページ送り/モバイル確認は配信証跡に保持しています。新しい7日間の自然収集実績を検証済みとは扱いません。

2026-10-04のローカル再検証は `pnpm check`、単体8 file/93件、Vite build/client境界、Wrangler `deploy:dry-run`、既存browser14件が成功しました。browserは `PLAYWRIGHT_CHANNEL=msedge` でlocalhost:5174の合成データだけを使用しました。標準Chromiumは未導入のため初回は起動できず、既存Edgeによる実行で解消しています。今回の本番画面の再配信・新しい実通知・live収集はありません。

Gitに保存したevidence/成果物manifestのbyte digestも原本と一致しました。`docs/releases/*.json` は `.gitattributes` で改行変換の対象外とし、別環境のcheckoutでも既存台帳のSHA-256を保持します。

## 2026-10-05 GitHub保全とレビュー再開

上のGitHub未公開・Netlify保留は10月4日時点の記録。所有者が「Netlifyは問題ないのでそちらも進めて」と確認したため、対象repoのpush/PR保留を解除した。Netlifyの設定を独立に再検査・変更したという意味ではない。

作業branch `codex/operations-acceptance-20261004` / `ff46be8ecf20f9df8df52374e3991c5a217e21fe` のGitHub pushとremote head照合が完了し、本番 `97277dee49f888c69e54cef72e8566d1d432ef73` が祖先としてGitHubで取得できることも確認した。[CI 37246640534](https://github.com/kaznaritanaka-ctrl/AI-Investment-Admin/actions/runs/37246640534)は93 unit tests、14 browser tests、型、build/client境界、lockfile/差分に成功。[Draft PR #3](https://github.com/kaznaritanaka-ctrl/AI-Investment-Admin/pull/3)を作成した。mainは5ed8eb6のままで、mergeや再deployは行っていない。この追記は文書のみで、上のCIは明記したcommitに対する結果である。

Overviewと7専用ページ、ECB修正、ADMIN_READ、配信台帳は配信済み。画面からの再実行・設定変更・権利変更は次段階の未実装機能。未配信の運用判定/0006とschema drift候補、外部runner/自動briefing、GPU/電力、長期保存、運用受け入れの残件は[APIの受け入れ記録](https://github.com/kaznaritanaka-ctrl/AI-Investment-APIs/blob/codex/schema-drift-recovery-20261005/docs/operations-acceptance.md)へ集約した。Adminに新しいruntime変更やdeployは必要ない。
