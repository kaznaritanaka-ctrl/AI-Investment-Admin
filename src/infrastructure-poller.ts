import { InfrastructureSchema } from "./infrastructure-contract.ts";
import type { Infrastructure } from "./infrastructure-contract.ts";
import { readJSON, retryAt } from "./network.ts";

export type InfraPollState = {
  report: Infrastructure | null;
  busy: boolean;
  error: string | null;
  nextAllowedAt: number;
};
export const INITIAL_INFRA_STATE: InfraPollState = {
  report: null,
  busy: false,
  error: null,
  nextAllowedAt: 0,
};
// Independent from the established 60-second public status poller.
// Infrastructure auto refresh: 5 min; manual refresh: >=60 s + upstream Retry-After.
export class InfrastructurePoller {
  state: InfraPollState = { ...INITIAL_INFRA_STATE };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private auto = true;
  private hidden = false;
  private stopped = false;
  constructor(
    private publish: (state: InfraPollState) => void,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
  ) {}
  private emit() {
    this.publish({ ...this.state });
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.stopped && this.auto && !this.hidden)
      this.timer = setTimeout(
        () => void this.refresh(),
        Math.max(300000, this.state.nextAllowedAt - this.now()),
      );
  }
  setAuto(value: boolean) {
    this.auto = value;
    this.schedule();
  }
  setHidden(value: boolean) {
    const previous = this.hidden;
    this.hidden = value;
    if (value) clearTimeout(this.timer);
    else if (previous && this.auto) {
      void this.refresh();
      this.schedule();
    }
  }
  async refresh() {
    if (
      this.stopped ||
      this.state.busy ||
      this.now() < this.state.nextAllowedAt
    )
      return;
    clearTimeout(this.timer);
    this.state.busy = true;
    this.state.error = null;
    this.emit();
    this.controller = new AbortController();
    const timer = setTimeout(() => this.controller?.abort(), 12000);
    let retry = 0;
    try {
      const r = await this.fetcher("/api/infrastructure", {
        method: "GET",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        signal: this.controller.signal,
      });
      if (r.status === 429 || r.headers.has("retry-after"))
        retry = Date.parse(retryAt(r.headers.get("retry-after"), this.now()));
      if (!r.ok) throw new Error("unavailable");
      this.state.report = InfrastructureSchema.parse(
        await readJSON(r, 128 * 1024),
      );
    } catch {
      this.state.report = null;
      this.state.error = "Cloudflare metrics unavailable · 取得失敗";
    } finally {
      clearTimeout(timer);
      this.state.busy = false;
      this.state.nextAllowedAt = Math.max(this.now() + 60000, retry);
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
