// Server-only allowlist. Names/IDs verified through read-only Cloudflare MCP, 2026-09-30.
// These are identifiers, not bindings. No database/object contents are read.
export const ACCOUNT_ID = "0f9bb71bb987011462a91596f7cc9e6f";
export const WORKERS = [
  "ai-investment-collector",
  "ai-investment-api",
  "ai-investment-admin",
] as const;
export const DATABASES = [
  { name: "ai-investment-private", id: "f9239883-9929-4137-8079-5a03d9a8beb2" },
  { name: "ai-investment-public", id: "cf0f6bf8-142a-4c48-8468-4f9a5b1a42b3" },
] as const;
export const BUCKET = "ai-investment-evidence-private";
