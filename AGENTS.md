# Scope

- Change only AI-Investment-Admin. AI-Investment-APIs is a read-only reference.
- Browser -> GET /api/status -> four fixed public GET endpoints. No arbitrary URL proxy, credentials, database bindings or collector controls.
- Distinguish HTTP health, collector processing record, and live observations for each source. Keep the initial check timestamp fixed.
- Never turn null into zero or parse decimal price strings as floating point. Never substitute synthetic prices on the app.
- Keep synthetic fixtures under tests/. Default tests/build must not contact the public API. Live smoke is explicit opt-in.
- No observation persistence, caching, service worker, automatic deployment or Access changes.
- workers_dev=false, preview_urls=false and routes=[] until separate publication approval and Access protection.
- Run pnpm.cmd check, pnpm.cmd test, pnpm.cmd build and browser tests when available. Document unexecuted checks honestly.
