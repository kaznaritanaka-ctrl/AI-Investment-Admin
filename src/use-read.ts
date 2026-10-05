import { useEffect, useRef, useState } from "react";
import { readJSON, retryAt } from "./network.ts";
export interface ReadState<T> {
  data: T | null;
  error: string | null;
  busy: boolean;
  receivedAt: string | null;
  nextAllowedAt: number;
}
export function useRead<T>(
  url: string | null,
  parse: (value: unknown) => T,
  interval: number | null,
  auto: boolean,
) {
  const [state, setState] = useState<ReadState<T>>({
    data: null,
    error: null,
    busy: false,
    receivedAt: null,
    nextAllowedAt: 0,
  });
  const current = useRef<() => void>(() => {});
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const requestedURL = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false,
      busy = false,
      nextAllowed = 0,
      nextPoll = 0;
    let controller: AbortController | null = null;
    requestedURL.current = url;
    setState({
      data: null,
      error: null,
      busy: false,
      receivedAt: null,
      nextAllowedAt: 0,
    });
    async function refresh() {
      if (
        !url ||
        stopped ||
        busy ||
        document.hidden ||
        Date.now() < nextAllowed
      )
        return;
      busy = true;
      controller = new AbortController();
      nextPoll = Date.now() + (interval ?? 0);
      nextAllowed = Date.now() + 60000;
      setState((s) => ({ ...s, busy: true }));
      const timeout = setTimeout(() => controller?.abort(), 12000);
      let failure =
        "現在取得できません。認証・接続・応答形式を確認してください。";
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
          credentials: "same-origin",
        });
        if (response.status === 429 || response.status === 503)
          nextAllowed = Date.parse(
            retryAt(response.headers.get("retry-after"), Date.now()),
          );
        if (!response.ok) {
          if (response.status === 400)
            failure =
              "検索条件を確認してください。期間は31日以内で指定してください。";
          if (response.status === 401 || response.status === 403)
            failure = "認証・接続状態を確認してください。";
          throw new Error(
            response.status === 401 || response.status === 403
              ? "認証・接続状態を確認してください"
              : "取得に失敗しました",
          );
        }
        const data = parseRef.current(await readJSON(response));
        if (!stopped)
          setState({
            data,
            error: null,
            busy: false,
            receivedAt: new Date().toISOString(),
            nextAllowedAt: nextAllowed,
          });
      } catch {
        if (document.hidden && controller?.signal.aborted) {
          if (!stopped) setState((s) => ({ ...s, busy: false }));
          return;
        }
        nextAllowed = Math.max(nextAllowed, Date.now() + 60000);
        if (!stopped)
          setState((s) => ({
            ...s,
            data: null,
            busy: false,
            error: failure,
            nextAllowedAt: nextAllowed,
          }));
      } finally {
        clearTimeout(timeout);
        busy = false;
      }
    }
    current.current = () => {
      void refresh();
    };
    void refresh();
    const timer = interval
      ? setInterval(() => {
          if (autoRef.current && Date.now() >= nextPoll) void refresh();
        }, 1000)
      : null;
    const visibility = () => {
      if (document.hidden) controller?.abort();
      else if (autoRef.current && interval) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, interval]);
  return {
    ...(requestedURL.current === url
      ? state
      : { ...state, data: null, error: null, busy: !!url }),
    refresh: () => current.current(),
  };
}
