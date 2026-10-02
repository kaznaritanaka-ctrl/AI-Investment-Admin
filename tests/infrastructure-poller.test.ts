import { it, expect, vi, afterEach } from "vitest";
import { InfrastructurePoller } from "../src/infrastructure-poller.ts";
import { infrastructureFixture } from "./infrastructure-fixtures.ts";
import { NOW, json } from "./fixtures.ts";
afterEach(() => vi.useRealTimers());
it("5分更新、手動60秒制限、重複抑止、非表示とauto offを尊重", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => json(infrastructureFixture()));
  const p = new InfrastructurePoller(() => {}, f);
  await Promise.all([p.refresh(), p.refresh()]);
  await p.refresh();
  expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(299999);
  expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(f).toHaveBeenCalledTimes(2);
  p.setHidden(true);
  await vi.advanceTimersByTimeAsync(600000);
  expect(f).toHaveBeenCalledTimes(2);
  p.setHidden(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(f).toHaveBeenCalledTimes(3);
  p.setAuto(false);
  await vi.advanceTimersByTimeAsync(600000);
  expect(f).toHaveBeenCalledTimes(3);
  p.stop();
});
it("rate limitを自動・手動・表示復帰でも守り、失敗で古い値をクリア", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () => json(infrastructureFixture()))
    .mockImplementation(async () => json({}, 429, { "retry-after": "600" }));
  const p = new InfrastructurePoller(() => {}, f);
  await p.refresh();
  await vi.advanceTimersByTimeAsync(300000);
  expect(p.state.report).toBeNull();
  expect(p.state.error).toContain("Cloudflare metrics unavailable");
  p.setHidden(true);
  p.setHidden(false);
  await p.refresh();
  await vi.advanceTimersByTimeAsync(599999);
  expect(f).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(f).toHaveBeenCalledTimes(3);
  p.stop();
});
it("200 partial Retry-Afterも尊重し、不正JSON・null responseを破棄", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () =>
      json(infrastructureFixture(), 200, { "retry-after": "900" }),
    )
    .mockImplementation(async () => json({ unexpected: true }));
  const p = new InfrastructurePoller(() => {}, f);
  await p.refresh();
  await vi.advanceTimersByTimeAsync(899999);
  expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(p.state.report).toBeNull();
  p.stop();
});
