import { ENDPOINTS, UPSTREAM, ErrorSchema, StatusSchema } from "./contracts.ts";
import type { EndpointKey, EndpointResult, Status } from "./contracts.ts";

export const TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
export function retryAt(value: string | null, now: number): string {
  const numeric =
    value !== null && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  const date = numeric === null && value ? Date.parse(value) : NaN;
  const ms =
    numeric !== null && Number.isFinite(numeric) ? now + numeric * 1000 : date;
  // Absent/invalid Retry-After: wait at least one normal polling interval. Never retry immediately.
  return new Date(
    Math.min(
      8640000000000000,
      Math.max(now + 60000, Number.isFinite(ms) ? ms : 0),
    ),
  ).toISOString();
}
export async function readJSON(
  response: Response,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  if (
    !/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    throw new Error("format");
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw new Error("too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("format");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("too_large");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("format");
  }
}
export async function collectStatus(
  fetcher: typeof fetch = fetch,
  options: { now?: () => number; timeoutMs?: number } = {},
): Promise<Status> {
  const now = options.now ?? Date.now;
  const entries = await Promise.all(
    (Object.keys(ENDPOINTS) as EndpointKey[]).map(async (key) => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? TIMEOUT_MS,
      );
      const result: EndpointResult<unknown> = {
        state: "error",
        http_status: null,
        checked_at: "",
        data: null,
        issue: null,
        error_kind: null,
        retry_at: null,
      };
      try {
        // No caller-supplied path, query, auth headers, cookies, redirects or retries.
        const response = await fetcher(UPSTREAM + ENDPOINTS[key].path, {
          method: "GET",
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        result.http_status = response.status;
        if (response.status === 429)
          result.retry_at = retryAt(response.headers.get("retry-after"), now());
        if (!response.ok) {
          if ((key === "latest" || key === "fx") && response.status === 404) {
            const body = await readJSON(response);
            const err = ErrorSchema.safeParse(body);
            if (err.success && err.data.error.code === "no_observation") {
              result.state = "empty";
              result.issue = "no_observation";
            } else {
              result.error_kind = "http";
              result.issue = "HTTP 404（no_observation以外）";
            }
          } else {
            result.error_kind = "http";
            result.issue = "HTTP " + response.status;
            await response.body?.cancel();
          }
        } else {
          const parsed = ENDPOINTS[key].schema.safeParse(
            await readJSON(response),
          );
          if (!parsed.success) throw new Error("format");
          result.state = "ok";
          result.data = parsed.data;
        }
      } catch (e) {
        result.state = "error";
        result.data = null;
        const kind = controller.signal.aborted
          ? "timeout"
          : e instanceof Error && ["format", "too_large"].includes(e.message)
            ? (e.message as "format" | "too_large")
            : "network";
        result.error_kind = kind;
        result.issue = {
          timeout: "10秒以内に応答を読み終えられませんでした",
          format: "JSONまたは応答形式を確認できませんでした",
          too_large: "応答サイズ上限を超えました",
          network: "公開APIへ接続できませんでした",
        }[kind];
      } finally {
        clearTimeout(timer);
        result.checked_at = new Date(now()).toISOString();
      }
      return [key, result] as const;
    }),
  );
  return StatusSchema.parse({
    schema_version: "admin-status-v1",
    upstream: UPSTREAM,
    fetched_at: new Date(now()).toISOString(),
    endpoints: Object.fromEntries(entries),
  });
}
