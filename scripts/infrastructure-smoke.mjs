import { collectInfrastructure } from "../src/infrastructure.ts";
if (!process.argv.includes("--allow-network")) {
  console.error(
    "Read-only infrastructure smoke is opt-in: pnpm smoke:infrastructure --allow-network",
  );
  process.exit(2);
}
if (!process.env.CLOUDFLARE_READ_TOKEN || !process.env.CF_ACCOUNT_ID) {
  console.error(
    "Requires an owner-approved read-only token and the configured account. No request sent.",
  );
  process.exit(2);
}
const r = await collectInfrastructure({
  CLOUDFLARE_READ_TOKEN: process.env.CLOUDFLARE_READ_TOKEN,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
});
console.log(
  JSON.stringify({
    fetched_at: r.fetched_at,
    availability: r.availability,
    configuration: r.configuration,
    workers: r.workers.map((w) => ({
      name: w.name,
      metadata: w.metadata.state,
      metrics: w.metrics.state,
    })),
    d1: r.d1.map((d) => ({
      name: d.name,
      metadata: d.metadata.state,
      metrics: d.metrics.state,
    })),
    r2: {
      metadata: r.r2.metadata.state,
      storage: r.r2.storage.state,
      operations: r.r2.operations.state,
    },
  }),
);
if (r.availability !== "ready") process.exitCode = 1;
