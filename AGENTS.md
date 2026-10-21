# 運用方針（2026-10-21 Kaz決定・全リポジトリ共通）

この節は下の既存ルールより優先する。ただし既存の技術ルール（権利ゲート、migration、Secrets、テスト手順など）は緩めない。

## 役割と判断
- Kaz（オーナー）が決めるのは「費用」と「方針」だけ。技術的な判断はAIが行い、Kazには平易な日本語で結果と理由を伝える。専門用語を使うときは一言で意味を添える。
- 実装担当は Claude Code（`claude-sonnet-5-5`）と Codex（`gpt-6.1-sol`）。1つの変更は片方が実装し、もう片方がレビューする（相互レビュー）。
- 両者の意見が分かれたら Claude Code の `claude-opus-5-5` が判断する。判断理由はPRに残す。
- SubAgent を使うかどうかは各タスクで各エージェントが決めてよい。
- 利用上限に近づいたら Codex を優先して使う。どちらも上限なら作業を翌日に回す。追加課金で上限を超えない。

## マージとデプロイ
- 相互レビューで承認され、テストとCIがすべて通った変更は、AIがmainへマージし本番へデプロイしてよい。
- 次は従来どおり個別にKazの承認が要る：費用が増える変更（有料プラン・新サービス・従量課金が大幅に増える設定。小さな従量課金は除く）、新しい情報源の権利grant、Secrets/トークンの新規作成や権限拡大、ドメイン/Access変更、データの公開範囲を広げる変更。
- 本番のremote migrationは、相互レビューでmigration自体を確認し、ローカルで既存データ相当の検証が通った場合だけ行う。破壊的migration（削除・型変更）は意見が一致していても Opus 判断を経る。
- マージ・デプロイ後は動作確認を行い、失敗したら直前の版へ戻してKazに報告する。
- 相互レビューの片方が利用上限で使えないときは、片方だけでマージせず翌日に回す。

## 費用
- Cloudflare は Workers Paid（月額5ドル）で運用する。有料プランの変更や新しい有料サービスの追加はKazの承認なしに行わない（小さな従量課金は下記のとおり許容）。
- 小さな従量課金（D1/R2 の保存量・リクエスト増など）は許容する。従量部分が大幅に増えそうな場合（数値の目安はKazが決めるまで、毎月の見積もりで前月より大きく増える見込みになった場合）だけ、止めてKazに相談する。
- 毎月1日に来月〜1年後の費用見積もりをKazに報告する（定期ルーティンあり）。
- 運用費は Grok・Claude・ChatGPT のサブスクリプションと Cloudflare だけで賄う。別のAPIキー課金や外部有料サービスを増やさない。

## データと公開
- データ元ごとの扱いは利用規約・ライセンスで決める（Kaz決定 2026-10-21）：
  - 再配布が認められている → 公開してよい。
  - 記載がない・判断がつかない → 研究用として非公開で保存（公開しない）。
  - 自動取得や再配布が禁止されている → 収集しない（非公開でも不可）。例: OpenRouter、RunPod。
  - この3区分の判定はAIが行い、判定結果と根拠を記録する。ただし研究用の収集・保存はソースごとの research grant と保存ゲートを通した場合だけ行い（通過前は従来どおり取得も保存もしない）、公開用の収集は既存の権利・保存ゲートに従う。grant の新規登録と公開範囲の拡大は従来どおり個別にKazの承認を取る。
- 後から禁止と判明したソースは収集を止める。保存済みデータの削除は、既存の保持・削除手順に従い、Kazに報告してから行う。
- 個人研究用途として収集したデータは原則公開しない。
- データを出すときは、APIの仕様どおりライセンス・出典の情報を必ず一緒に付ける。

## 触らないもの
- NAS（TOS7）のバックアップ基盤には触らない（設定・スクリプト・認証情報を含む）。

## スケジュールと報告
- データ収集は毎日 03:00 JST過ぎ、その後にバックアップ。Morning Brief は 07:00 JST ごろにKazのチャットへ出す。
- 報告は平易な日本語で、Kazに判断してほしいこと（費用・方針）を一番上に書く。
- Kazは Windows PC・iPad・iPhone から操作する。Kazに頼む作業はブラウザかスマホで完結する形にし、コマンド操作を求めない。

---

# 既存ルール（技術）

- 注記: deployの「immediate owner approval」は、上の運用方針の条件（相互レビュー承認＋check/test/build/test:browser/deploy:dry-run成功）を満たせば満たされたものとする。トークン新規作成・Secret登録・権限拡大は引き続きKazの承認が必要。

<!-- Current state 2026-10-05: production 97277de, ADMIN_READ and ledger five records active per the 2026-10-04 verification. See docs/operations-pages.md. Older release notes are historical. Owner confirmed Netlify is not a blocker and released the GitHub push/PR hold for this work; the latest branch is published as draft PR #3. This is owner confirmation, not an independent Netlify settings audit. Main merge and production changes still require separate approval. This acceptance change is documentation/provenance only; no new Admin deploy is needed. -->

# Scope and boundaries

- The owner-approved 2026-10-04 operations-page plan also authorizes a coordinated AI-Investment-APIs change: named AdminRead service entrypoint, bounded read projections, and additive private release ledger. The Admin itself has no data bindings or write controls. Production migration/configuration/deployment still require immediate approval.
- The production Admin uses `admin.ai-investment-research.net` and Worker-bound Cloudflare Access. Current code is `97277dee49f888c69e54cef72e8566d1d432ef73`, version `51e3f59d-1586-4507-8370-fdca8823e9f4` at 100%, with eight read-only pages and ADMIN_READ. See `docs/operations-pages.md` and `docs/releases/`. The preceding ECB-fix release `c711de5` / `2aa88e1d-ca7d-4fbc-9414-d1984001dcb8` is historical; its verification is in `docs/ecb-admin-fix-20261003.md`. Confirm configuration/service compatibility and obtain immediate approval before any rollback. The original operations-cockpit working tree remains untouched; this isolated copy snapshots it at `8529b77`. Distinguish deployed code from later documentation commits.
- Preserve `workers_dev=false`, `preview_urls=false`, CSP and read-only behavior. No alternate route, automatic deploy, Access/DNS change, secret registration or token creation without explicit owner approval. Current Wrangler configuration declares the approved production Custom Domain, non-secret `CF_ACCOUNT_ID` and ADMIN_READ. Older main's `routes=[]` and `docs/production-deployment-plan.md` describe the historical rollout, not the current target. Obtain approval immediately before each new token creation, secret registration, configuration change or deploy.
- This code candidate uses Workers Metadata Read-Only (legacy Workers Tail Read equivalent) and Account Analytics Read only. D1/R2 capacity comes from Analytics samples, not REST metadata or object reads. Historical production used two additional permissions; code changes do not establish that the runtime token has been narrowed. Verify Cron/Domain and all metrics with the reduced token during the separately approved rollout. Do not add Workers Scripts Read. Future inaccessible fields remain Unknown; permission expansion needs separate approval after diagnosis. MCP credentials are separate and cannot prove runtime token permissions. Do not retrieve its value for verification.
- Browser -> GET `/api/status` -> five fixed public GET endpoints, including the independent `/v1/latest?dataset=fx` request. Preserve contracts, poller, errors and decimal strings. Browser -> GET `/api/infrastructure` -> server-only fixed Cloudflare metadata GETs/GraphQL queries. Never accept URL/path/account/query/token from browser input.
- `CLOUDFLARE_READ_TOKEN` is an optional Worker Secret, never a VITE_ variable. Keep `infrastructure.ts` and `infrastructure-targets.ts` out of the client import graph. Project through `InfrastructureSchema`; never expose/log raw upstream JSON, exceptions, headers, account credentials, D1 rows, R2 objects or Worker Secret values.
- No database/R2 bindings or queries in the Admin, object APIs, write endpoints, Collector/source controls or notification sending. The named ADMIN_READ service binding returns allowlisted DTOs only. GraphQL POST must contain a static read query, never a mutation.
- Distinguish HTTP health, collector processing record, live source observation freshness, platform metrics and missing business-run telemetry. Preserve the fixed initial check timestamp and legacy assessment in its folded panel. No price change is required for healthy re-observation.
- Do not infer enabled status, rights deadlines, retention or sources from repository configuration. Public source metadata is not a complete Collector inventory. GPU/OpenRouter absent from the API means unavailable, not disabled.
- Never convert null/empty series/errors to zero. Decimal prices stay strings. Metrics are rolling-24h project aggregates, not account/day/month quota usage. Manual plan evidence is not API-verified Free.
- Default check/test/build/browser checks must not call production APIs. Synthetic responses stay under `tests/`; never ship demo fallback data. Browser tests stub both Admin endpoints and use their own 5174 server.
- Public polling stays 60s; infrastructure is independent at 5min with 60s manual minimum, bounded concurrency/deadline and Retry-After. Stop polling when hidden/auto off. No persistent observation cache, localStorage or service worker.
- Run `pnpm.cmd check`, `pnpm.cmd test`, `pnpm.cmd build`, `pnpm.cmd test:browser`, then `pnpm.cmd deploy:dry-run` using the generated Vite config. Never remove `--dry-run` without immediate owner approval. Live smoke is separate explicit opt-in; never request/copy a token into a test fixture or command log. Record screenshots as synthetic, and distinguish MCP production read checks from new Worker live/deploy verification.
