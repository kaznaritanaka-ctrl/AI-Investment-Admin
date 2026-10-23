import type { Usage } from "../src/contracts.ts";
export function usageFixture(): Usage {
  return { status: "ok", period: "30d", fetched_at: "2026-10-23T00:00:00.000Z",
    daily: [{ day: "2026-10-22", statusClass: "2xx", calls: 90 }, { day: "2026-10-22", statusClass: "429", calls: 5 }, { day: "2026-10-22", statusClass: "5xx", calls: 5 }],
    endpoints: [{ route: "/v1/latest", calls: 100, rateLimited: 5, errors: 5 }], countries: [{ country: "JP", calls: 100 }], matrix: [{ route: "/v1/latest", country: "JP", calls: 100 }],
  };
}
