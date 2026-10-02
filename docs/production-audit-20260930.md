# Admin production: read-only MCP確認

これは本番反映**前**の監査記録。後続の所有者承認により2026-09-30 21:38 JSTにコックピットを配信し、21:48 JSTに4権限tokenの対象範囲を修正してruntime実取得を確認した。現在のversion・bindings・live結果は[本番反映記録](production-deployment-plan.md)を参照。この文書の「未登録・未実施・承認待ち」は監査時点の状態を保持している。

確認日：2026-09-30 JST。Cloudflare plugin/MCPのGETとGraphQL read query/introspectionのみ。token/Secret値、D1行、R2 object本文を取得せず、mutationなし。

| 項目 | Cloudflare実状態 | Gitとの差分・解釈 |
|---|---|---|
| Admin | `ai-investment-admin`、tag `8f6e87449e6c43a5b22b479c4a7505fc` | name一致 |
| Custom Domain | `admin.ai-investment-research.net` → Admin / production | Gitの`routes=[]`とdrift。変更せず記録 |
| workers.dev / preview | false / false | Gitと一致 |
| compatibility_date | 2026-09-29 | Gitと一致 |
| bindings | ASSETSのみ | Gitと一致。read token Secret未登録 |
| Observability | script-settingsのobservability=null | Gitはenabled=false。nullを無効設定の完全一致とは断定しない |
| deployment | `0a1d6a4a-10c4-4f6c-8b7a-7527a5c52598`、2026-09-29T16:48:46.586202Z | Git SHAとの対応は未確認 |
| version | `a25fb401-53bf-442c-9489-4aa475afcd39`、traffic 100% | 新実装のdeployは未実施 |
| Access | account app `236cac25-1ca0-4ba9-b780-6e35b0679b51`、self_hosted | destinationsのworker_idがAdmin tagに一致するWorker-bound構成 |
| Access policy | allow 1件、include=email、require/excludeなし | 取得policyにbypass/Everyoneなし。メール値を出力・保存していない。zone-level app一覧が空でも保護なしとは解釈しない |

GitHub fetch後、origin/main `5ed8eb6`（PR #2 merge）と開発branch `codex/wide-overview-layout` `7a744ff`のtreeが同じと確認。mainから`codex/operations-cockpit`を作成。AI-Investment-APIsは`244af2b4d8097804463da28690dc8f5e7fcec314`のtreeを参照しただけ。

D1 metadata GETで`ai-investment-private` / `f9239883-9929-4137-8079-5a03d9a8beb2`、`ai-investment-public` / `cf0f6bf8-142a-4c48-8468-4f9a5b1a42b3`、R2 metadataで`ai-investment-evidence-private`も確認。SQL/object操作なし。

公式docsとGraphQL introspectionでCPU単位µs、D1 rowsRead/rowsWritten、R2集計fieldsを照合し、MCPの同等queryでWorker/D1/R2 aggregate取得を確認した。これは**MCP認証でのschema/接続確認**であり、新Admin clientのtoken permission検証・Worker runtime live smoke・deploy成功ではない。実数値を初期表示やfixtureへ転記していない。

権限・設定準備は[infrastructure.md](infrastructure.md)。drift整理とSecret登録・deployは所有者承認待ち。未認証ブラウザの全パス保護を含むdeploy後smokeは未実施。
