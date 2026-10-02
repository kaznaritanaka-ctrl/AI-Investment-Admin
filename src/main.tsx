import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard.tsx";
import { StatusPoller } from "./poller.ts";
import type { PollState } from "./poller.ts";
import { InfrastructurePoller } from "./infrastructure-poller.ts";
import type { InfraPollState } from "./infrastructure-poller.ts";
import "./style.css";

function App() {
  const [poller] = useState(() => new StatusPoller((s) => setState(s)));
  const [state, setState] = useState<PollState>(poller.state);
  const [infraPoller] = useState(
    () => new InfrastructurePoller((s) => setInfrastructure(s)),
  );
  const [infrastructure, setInfrastructure] = useState<InfraPollState>(
    infraPoller.state,
  );
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const visibility = () => {
      poller.setHidden(document.hidden);
      infraPoller.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    if (!document.hidden) void poller.refresh();
    if (!document.hidden) void infraPoller.refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      poller.stop();
      infraPoller.stop();
    };
  }, [poller, infraPoller]);
  return (
    <Dashboard
      state={state}
      now={now}
      refresh={() => {
        void poller.refresh();
        void infraPoller.refresh();
      }}
      setAuto={(value) => {
        poller.setAuto(value);
        infraPoller.setAuto(value);
      }}
      infrastructure={infrastructure}
      refreshInfrastructure={() => void infraPoller.refresh()}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
