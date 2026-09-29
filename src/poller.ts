import { StatusSchema } from "./contracts.ts";
import type { Status } from "./contracts.ts";
import { readJSON, retryAt } from "./network.ts";
export type PollState = {
  report: Status | null;
  busy: boolean;
  auto: boolean;
  hidden: boolean;
  receivedAt: string | null;
  attemptedAt: string | null;
  error: string | null;
  nextAllowedAt: number;
};
export class StatusPoller {
  state: PollState = {
    report: null,
    busy: false,
    auto: true,
    hidden: false,
    receivedAt: null,
    attemptedAt: null,
    error: null,
    nextAllowedAt: 0,
  };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private stopped = false;
  constructor(
    private publish: (state: PollState) => void,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
  ) {}
  private emit() {
    this.publish({ ...this.state });
  }
  private schedule(delay = 60000) {
    clearTimeout(this.timer);
    if (!this.stopped && this.state.auto && !this.state.hidden) {
      this.timer = setTimeout(
        () => void this.refresh(),
        Math.max(delay, this.state.nextAllowedAt - this.now()),
      );
    }
  }
  setAuto(auto: boolean) {
    this.state.auto = auto;
    this.emit();
    this.schedule();
  }
  setHidden(hidden: boolean) {
    const previous = this.state.hidden;
    this.state.hidden = hidden;
    if (hidden) clearTimeout(this.timer);
    else if (previous && this.state.auto) {
      void this.refresh();
      this.schedule();
    }
    this.emit();
  }
  async refresh() {
    if (this.stopped || this.state.busy) return;
    if (this.now() < this.state.nextAllowedAt) {
      this.schedule(this.state.nextAllowedAt - this.now());
      return;
    }
    clearTimeout(this.timer);
    this.state.busy = true;
    this.state.error = null;
    this.state.attemptedAt = new Date(this.now()).toISOString();
    this.controller = new AbortController();
    const timer = setTimeout(() => this.controller?.abort(), 12000);
    this.emit();
    let retry = 0;
    try {
      const response = await this.fetcher("/api/status", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: this.controller.signal,
      });
      if (response.status === 429 || response.headers.has("retry-after"))
        retry = Date.parse(
          retryAt(response.headers.get("retry-after"), this.now()),
        );
      if (!response.ok)
        throw new Error(
          "画面のAPI取得に失敗しました（HTTP " + response.status + "）",
        );
      const parsed = StatusSchema.safeParse(
        await readJSON(response, 8 * 1024 * 1024),
      );
      if (!parsed.success)
        throw new Error("画面のAPI応答形式を確認できませんでした");
      this.state.report = parsed.data; // Replace atomically. Never merge old observation rows.
      this.state.receivedAt = new Date(this.now()).toISOString();
      retry = Math.max(
        retry,
        ...Object.values(parsed.data.endpoints).map((r) =>
          r.retry_at ? Date.parse(r.retry_at) : 0,
        ),
      );
    } catch (e) {
      this.state.report = null; // Failed fields never retain unlabelled old values.
      this.state.error = this.controller.signal.aborted
        ? "画面の取得がタイムアウトしました"
        : e instanceof Error && !["format", "too_large"].includes(e.message)
          ? e.message
          : "画面のAPI応答形式を確認できませんでした";
    } finally {
      clearTimeout(timer);
      this.state.busy = false;
      this.state.nextAllowedAt = Math.max(this.now() + 5000, retry);
      if (!this.stopped) {
        this.emit();
        this.schedule();
      }
    }
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
  }
}
