import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunRecovery } from "../src/RunRecovery.tsx";
import { AdminReport } from "../src/admin-contract.ts";
import { operational, run, recoveryFixture } from "./admin-fixtures.ts";

it("renders failure, private-evidence state and unknown agent results independently", () => {
  const r = run("models_dev");
  r.recovery = recoveryFixture();
  const html = renderToStaticMarkup(<RunRecovery run={r} />);
  expect(html).toContain("取得先のschema変更");
  expect(html).toContain("wrapper_changed");
  expect(html).toContain("結果未連携・未報告");
  expect(html).toContain("2026/09/30 03:17:00 JST");
  expect(html).toContain("このrunの欠測</dt><dd>未確認");
  expect(html).not.toContain("b".repeat(64));
  expect(html).not.toContain("障害後の完了を記録済み");
});
it("shows historical and semantic blocks, including unavailable evidence", () => {
  const r = run();
  r.recovery = {
    ...recoveryFixture(),
    evidence_state: "expired",
    remaining_human_action: "confirm_source_semantics",
  };
  const html = renderToStaticMarkup(<RunRecovery run={r} />);
  expect(html).toContain("期限切れ・再解析不可");
  expect(html).toContain("提供元の単位・意味・対象範囲を判断");
  expect(renderToStaticMarkup(<RunRecovery run={run()} />)).toContain(
    "診断がないことを正常とは判定しません",
  );
});
it("accepts old Collector responses but refuses raw fields and unproven agent progress", () => {
  const old = operational("runs");
  expect(AdminReport.safeParse(old).success).toBe(true);
  const current = structuredClone(old);
  current.runs![0].recovery = recoveryFixture();
  expect(AdminReport.safeParse(current).success).toBe(true);
  for (const extra of [
    { raw_body: "PRIVATE_SENTINEL" },
    { agent_status: "completed" },
    { diagnostic_codes: ["SECRET"] },
  ]) {
    const bad = structuredClone(current);
    Object.assign(bad.runs![0].recovery!, extra);
    expect(AdminReport.safeParse(bad).success).toBe(false);
  }
});
