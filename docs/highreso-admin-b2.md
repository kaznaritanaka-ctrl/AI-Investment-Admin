# Highreso private Admin visibility (Part B2)

Local implementation only; not pushed or deployed.

- `#highreso` adds ハイレゾ (非公開調査). The existing same-origin, read-only Admin proxy exposes `/api/highreso` behind the existing Worker Access boundary. No Cloudflare route, binding, secret, Access or domain configuration changed.
- The proxy invokes only `ADMIN_READ.highresoRuns(30)` and `highresoLatestPrices()`. Existing `read(resource, query)` is unchanged. Queries are rejected, responses have the existing no-store/security headers, and both RPC responses must pass the copied Collector validators before any data is returned. A missing method/binding, RPC rejection, timeout or malformed response yields 503 with a fixed unavailable error. No raw exception or stale fallback is returned.
- `src/admin-highreso-contract.ts` is an exact copy of the local Collector file in `/workspace/wt-hr-api/src/`.
- The page preserves quote identity, decimal strings, units, tax status and nulls. It shows attribution and terms/license references for each RPC response, and explains private-only use and the 30-complete-run history bound. Observation timestamps remain UTC; run_date_jst is displayed as provided.
- Synthetic unit/browser tests cover rendering, empty history, unavailable state, clearing prices after failure, RPC validation and same-origin/read-only enforcement.

## Validation in this workspace

- Contract byte comparison, esbuild syntax checks, Prettier checks and `git diff --check` passed.
- Attempted check, test, build, test:browser and deploy:dry-run: blocked before execution by missing dependencies and Corepack attempting to write to a read-only directory. They have NOT passed. There is no separate lint script in package.json.
- An offline pnpm install unexpectedly attempted registry metadata requests; DNS/network requests failed and the process was stopped. No packages were downloaded. Further network access was not used.
- Claude mutual review remains outstanding; no network review was requested under the task's no-network rule.
- Full checks and mutual review are required before release. Collector Part A/B1 migration/release prerequisites are outside this Admin-only change.
