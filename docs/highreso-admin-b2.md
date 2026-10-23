# Highreso private Admin visibility (Part B2)

Released via PR after mutual review (Codex implementation, Claude review round 2 APPROVE, 2026-10-23).

- `#highreso` adds ハイレゾ (非公開調査). The existing same-origin, read-only Admin proxy exposes `/api/highreso` behind the existing Worker Access boundary. No Cloudflare route, binding, secret, Access or domain configuration changed.
- The proxy invokes only `ADMIN_READ.highresoRuns(30)` and `highresoLatestPrices()`. Existing `read(resource, query)` is unchanged. Queries are rejected, responses have the existing no-store/security headers, and both RPC responses must pass the copied Collector validators before any data is returned. A missing method/binding, RPC rejection, timeout or malformed response yields 503 with a fixed unavailable error. No raw exception or stale fallback is returned.
- `src/admin-highreso-contract.ts` is an exact copy of the local Collector file in `/workspace/wt-hr-api/src/`.
- The page preserves quote identity, decimal strings, units, tax status and nulls. It shows attribution and terms/license references for each RPC response, and explains private-only use and the 30-complete-run history bound. Observation timestamps remain UTC; run_date_jst is displayed as provided.
- Synthetic unit/browser tests cover rendering, empty history, unavailable state, clearing prices after failure, RPC validation and same-origin/read-only enforcement.

## Validation in this workspace

- Contract byte comparison, esbuild syntax checks, Prettier checks and `git diff --check` passed.
- 2026-10-23 (Node 24, pnpm 11.19): check, test, build, test:browser (22 passed, incl. Usage and Highreso) and deploy:dry-run all passed after rebasing onto the usage page (PR #9). There is no separate lint script in package.json.
- Claude mutual review: round 1 CHANGES, round 2 APPROVE.
- Requires the Collector release with `highresoRuns`/`highresoLatestPrices` (AI-Investment-APIs) to be deployed first.
