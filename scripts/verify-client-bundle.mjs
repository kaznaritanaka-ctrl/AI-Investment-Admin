import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ACCOUNT_ID, DATABASES } from "../src/infrastructure-targets.ts";
const forbidden = [
  "CLOUDFLARE_READ_TOKEN",
  "api.cloudflare.com",
  ACCOUNT_ID,
  ...DATABASES.map((d) => d.id),
  "synthetic-server-secret-sentinel",
  "private-sentinel",
  "Synthetic manual plan evidence",
];
async function inspect(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) await inspect(path);
    else if (/\.(js|html|json|css|map)$/.test(file.name)) {
      const body = await readFile(path, "utf8");
      if (forbidden.some((s) => body.includes(s)))
        throw new Error(
          "Server-only configuration or synthetic fixture found in client bundle",
        );
    }
  }
}
await inspect("dist/client");
const config = JSON.parse(
  await readFile("dist/ai_investment_admin/wrangler.json", "utf8"),
);
if (
  config.name !== "ai-investment-admin" ||
  config.account_id !== ACCOUNT_ID ||
  config.vars?.CF_ACCOUNT_ID !== ACCOUNT_ID ||
  Object.hasOwn(config.vars ?? {}, "CLOUDFLARE_READ_TOKEN") ||
  config.routes?.length !== 1 ||
  config.routes[0].pattern !== "admin.ai-investment-research.net" ||
  config.routes[0].custom_domain !== true ||
  config.workers_dev !== false ||
  config.preview_urls !== false ||
  config.d1_databases?.length ||
  config.r2_buckets?.length ||
  config.services?.length !== 1 ||
  config.services[0].binding !== "ADMIN_READ" ||
  config.services[0].service !== "ai-investment-collector" ||
  config.services[0].entrypoint !== "AdminRead" ||
  config.triggers?.crons?.length
)
  throw new Error(
    "Unexpected deployment target, production exposure or infrastructure binding in build",
  );
console.log(
  "Client bundle boundary passed: no server-only config, tokens, fixtures or data bindings.",
);
