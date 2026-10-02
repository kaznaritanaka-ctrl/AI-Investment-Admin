# ECBの状態・観測時刻表示の修正

モデルカタログ拡張後、公開APIの `/v1/latest` は `ORDER BY dataset,entity_key LIMIT 100` により100件すべてがモデルとなり、FXを返さなくなった。Adminは同じ配列でECBも判定していたため、Collectorの成功にかかわらずUnknown・観測時刻未提供となっていた。

Adminに固定GET `/v1/latest?dataset=fx` を追加した。ECBの状態・観測時刻・価格・件数は専用応答を使う。既存latestにFXが含まれても重複計上せず、FX取得失敗時にそこへ戻らない。モデルとFXのエラー・空状態を独立させ、失敗は件数null、正常な空応答は0件とする。decimal文字列と60秒polling、Retry-Afterは維持する。

## 作業範囲と検証

元のAdmin `codex/operations-cockpit`（HEAD `5ed8eb6`）の既存未コミット変更を47ファイルのハッシュ付きで保存し、別作業コピーのローカルコミット `8529b776da8702c65891e3ba2afc2679911f0605` を修正前の基準とした。修正ブランチは `codex/admin-ecb-scoped-latest`。元の作業環境に上書きしていない。

| 検証 | 結果 |
| --- | --- |
| `pnpm.cmd check` | 成功 |
| `pnpm.cmd test` | 7ファイル・84件成功 |
| `pnpm.cmd build` | Worker・client生成、client境界検査成功 |
| `pnpm.cmd test:browser` | Microsoft Edge・16件成功 |
| `pnpm.cmd deploy:dry-run` | 成功、アップロードなし |

モデル100件と別応答のFX3件を使い、OverviewとSourcesでECBのHealthy・JST観測時刻・3件を確認した。FXとモデルそれぞれの取得失敗、404 no_observation、空200、異なる404、403、429、timeout、別datasetの応答拒否、重複防止も検証した。PC・スマートフォンの既存画面テストも成功。通常テストは両Admin APIを合成応答に置換し、本番APIを使用していない。

画面記録 `work/screenshots/synthetic-ecb-100-models.png` は合成データ。実稼働の証明ではない。Chromium未導入のため既存Edgeを指定した。Windows sandboxでのWrangler親ディレクトリ参照・テストプロセス終了制限は、ローカル検証だけを実行権限付きで再実行して解消した。

通常チェックとは別に、08:34 JSTに修正コードで固定5公開GETを読み取り検証した。全てHTTP 200、latestはモデル100件、fxは3件。ECBはHealthy、observed_atは `2026-10-02T18:17:54.669Z`（`2026/10/03 03:17:54 JST`）と判定された。これはローカル修正コードと実公開データの照合であり、Admin本番反映後の検証ではない。元の47ファイルとGit HEADの不変もハッシュで確認した。

## 本番反映の対象

対象は既存 `ai-investment-admin` のコードと静的資産。公開API側やCollector、D1、R2の変更は不要。Wrangler設定・依存関係・Infrastructure取得コード・Secretは変更しない。固定の公開GETが60秒ごとに4本から5本になる。

承認後は既存の運用と同じく、生成済みVite設定を使って `wrangler versions upload` で候補を作成し、名前・種別だけで既存Secretの継承を確認してからdeployment APIで100%へ切り替える。非version設定を反映するdeploy/triggers操作は使わない。

2026-10-03 08:31 JST時点の本番Adminは `317f1afb-540c-43d8-9063-4c5b9d9fd648` が100%。workers.dev / preview URLは無効、ASSETS・CF_ACCOUNT_ID・既存Secret bindingを確認した。修正の本番反映は未実施。`AGENTS.md` に従い、成果物を確認した所有者の実行直前承認後に反映する。

反映後は実Admin経由でFX専用応答とECBの状態・JST表示、既存モデル表示、Infrastructure、Access保護を確認する。切戻し先は上記の既存version。API latestのモデル表示は引き続き最大100件の範囲であり、全カタログのページング追加は今回の対象外。
