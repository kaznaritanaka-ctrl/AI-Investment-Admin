# Overview整理と管理ページ

2026-10-04の所有者承認プランを実装したローカル候補です。Collector側は codex/admin-read-projection と組み合わせます。本番migration・設定変更・deployはまだ承認・実行の対象です。

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

Releasesの過去3記録は確認済みの証跡だけを候補SQLにまとめました。Cloudflareのversionと一致しないSHAを推測しません。台帳の更新機能は画面/APIにありません。Operatorの配信手順でハッシュ/commit/tree/検証を照合した追記だけを行います。

## 検証と反映

型・単体・ブラウザ・client bundle境界・Vite build・Wrangler dry-runを実施します。ブラウザは合成データのみで、4/5/6件の上限、125件のページ送り、失敗/未提供、リンク/戻る/JST/UTC、モバイル/キーボード、60秒更新・非表示停止、Data手動更新、GET-onlyを確認します。API側では読み取り入口、移行・不変条件、権利・保持・公開gate、runtime回帰を検証します。

ブラウザテストは専用5174を使います。Windowsの制限付き環境で開発サーバーの終了待ちに問題が出る場合は、別途5174のViteを起動し、PLAYWRIGHT_EXTERNAL_SERVER=true でテストを実行して、起動したサーバーだけを終了します。テストは外部HTTPを遮断し、synthetic画面を本番の検証結果として扱いません。

実行順序は、private 0005 → CollectorのAdminRead → Adminのservice binding → 承認済み台帳追記です。それぞれ直前に所有者確認を行います。公開APIの配信やpublic D1の変更は不要です。APIリポジトリの docs/admin-read.md に詳細と復旧手順があります。
