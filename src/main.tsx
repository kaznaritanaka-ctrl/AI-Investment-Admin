import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard.tsx";
import { StatusPoller } from "./poller.ts";
import type { PollState } from "./poller.ts";
import "./style.css";

function App() {
  const [poller] = useState(() => new StatusPoller((s) => setState(s)));
  const [state, setState] = useState<PollState>(poller.state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const visibility = () => poller.setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    if (!document.hidden) void poller.refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      poller.stop();
    };
  }, [poller]);
  return (
    <Dashboard
      state={state}
      now={now}
      refresh={() => void poller.refresh()}
      setAuto={(value) => poller.setAuto(value)}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
