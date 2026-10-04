import type { Resource } from "./admin-contract.ts";
export const pages = [
  "Overview",
  "Sources",
  "Runs",
  "Data",
  "Infrastructure",
  "Releases",
  "Rights",
  "Settings",
] as const;
export type Page = (typeof pages)[number];
export type Location = { page: Page; params: URLSearchParams };
export function parseLocation(hash: string): Location {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  return {
    page:
      pages.find((p) => p.toLowerCase() === path.toLowerCase()) ?? "Overview",
    params: new URLSearchParams(query),
  };
}
export function href(
  page: Page | Resource,
  values: Record<string, string | null | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
  return (
    "#" + page.toLowerCase() + (params.size ? "?" + params.toString() : "")
  );
}
export function retained(
  location: Location,
  page: Page,
): Record<string, string> {
  const allowed = [
    "source",
    ...(["Runs", "Data"].includes(page) ? ["from", "to", "run"] : []),
  ];
  return Object.fromEntries(
    [...location.params].filter(([key]) => allowed.includes(key)),
  );
}
export function apiURL(location: Location) {
  if (location.page === "Infrastructure") return null;
  const q = new URLSearchParams(location.params);
  q.delete("attention");
  q.delete("initial");
  return (
    "/api/" + location.page.toLowerCase() + (q.size ? "?" + q.toString() : "")
  );
}
