import { it, expect, vi, afterEach } from "vitest";
import { StatusPoller } from "../src/poller.ts";
import { report, fx, ai, json, NOW } from "./fixtures.ts";
afterEach(() => vi.useRealTimers());
it("連打と重複を防ぎ60秒更新、消えたデータを復活させない", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  let release!: (r: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(json(report()));
  const p = new StatusPoller(() => {}, fetcher);
  const first = p.refresh();
  void p.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  release(json(report([fx(), ai()])));
  await first;
  await p.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(p.state.report?.endpoints.latest.state).toBe("empty");
  p.stop();
});
it("429 Retry-After中は手動・自動・表示復帰でも再要求しない", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      json({ error: "rate_limited" }, 429, { "retry-after": "180" }),
    )
    .mockResolvedValue(json(report()));
  const p = new StatusPoller(() => {}, fetcher);
  await p.refresh();
  expect(p.state.report).toBeNull();
  p.setHidden(true);
  p.setHidden(false);
  await p.refresh();
  await vi.advanceTimersByTimeAsync(179999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  p.stop();
});
it("上流endpointのRetry-Afterにも従う", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const r = report();
  r.endpoints.latest = {
    state: "error",
    data: null,
    error_kind: "http",
    issue: "HTTP 429",
    http_status: 429,
    checked_at: new Date(NOW).toISOString(),
    retry_at: new Date(NOW + 240000).toISOString(),
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(r));
  const p = new StatusPoller(() => {}, fetcher);
  await p.refresh();
  await vi.advanceTimersByTimeAsync(239999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  p.stop();
});
it("非表示タブ・自動更新OFFは停止し、表示復帰で読み直す", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => json(report()));
  const p = new StatusPoller(() => {}, fetcher);
  await p.refresh();
  p.setHidden(true);
  await vi.advanceTimersByTimeAsync(300000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  p.setHidden(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
  p.setAuto(false);
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  p.stop();
});
it("最新の要求失敗時は前回の正常観測を表示し続けない", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(report([fx()])))
    .mockRejectedValueOnce(new Error("offline"));
  const p = new StatusPoller(() => {}, fetcher);
  await p.refresh();
  const received = p.state.receivedAt;
  await vi.advanceTimersByTimeAsync(60000);
  expect(p.state.report).toBeNull();
  expect(p.state.error).toBe("offline");
  expect(p.state.receivedAt).toBe(received);
  p.stop();
});
it("client自身もタイムアウトし、後続自動更新を続けられる", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
  const p = new StatusPoller(() => {}, fetcher);
  const running = p.refresh();
  await vi.advanceTimersByTimeAsync(12000);
  await running;
  expect(p.state.error).toContain("タイムアウト");
  expect(p.state.busy).toBe(false);
  p.stop();
});
