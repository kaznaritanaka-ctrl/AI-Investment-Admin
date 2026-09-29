import { collectStatus } from "../src/network.ts";
import { ENDPOINTS } from "../src/contracts.ts";
if (!process.argv.includes("--allow-network")) {
  console.error("Live GET is opt-in. Run pnpm.cmd smoke:live.");
  process.exit(2);
}
const report = await collectStatus();
console.log(
  "Read-only public API GET. No Collector, DB or Cloudflare management access.",
);
console.log("Checked at: " + report.fetched_at);
for (const [key, result] of Object.entries(report.endpoints)) {
  console.log(
    JSON.stringify({
      path: ENDPOINTS[key].path,
      state: result.state,
      http_status: result.http_status,
      issue: result.issue,
      retry_at: result.retry_at,
      ...(key === "health" && result.data
        ? {
            health_status: result.data.status,
            collector: result.data.collector,
            datasets: result.data.datasets,
          }
        : {}),
      ...(key === "latest" && result.data
        ? {
            observations: result.data.data.map((o) => ({
              source_id: o.source.source_id,
              dataset: o.dataset,
              observed_at: o.observed_at,
              data_origin: o.data_origin,
            })),
          }
        : {}),
    }),
  );
}
if (Object.values(report.endpoints).some((r) => r.state === "error"))
  process.exitCode = 1;
