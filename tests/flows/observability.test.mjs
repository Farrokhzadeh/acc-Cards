import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("phase 20 migration adds durable operational alerts and health scan", () => {
  const sql = read("db/migrations/0019_audit_observability_operations.sql");
  assert.match(sql, /CREATE TABLE operational_alerts/i);
  assert.match(sql, /operations-health-scan/);
  assert.match(sql, /duration_ms/);
  assert.match(sql, /operations\.read/);
});

test("operational snapshot covers required phase 20 signals", () => {
  const source = read("server/operations/service.ts");
  for (const signal of ["providerFailures", "providerTimeouts", "providerSyncLag", "emailFailures", "telegramDeliveryFailures", "webhookBacklog", "otpFailures24h", "stuckOperations", "secretReveals15m"]) {
    assert.ok(source.includes(signal), `missing signal ${signal}`);
  }
  assert.match(source, /operational_alerts/);
});

test("worker dispatches the operational health scanner", () => {
  const source = read("server/jobs/runner.ts");
  assert.match(source, /operations_health_scan/);
  assert.match(source, /scanOperationalHealth/);
  assert.match(source, /duration_ms/);
});

test("admin console exposes an operations view", () => {
  const source = read("app/dashboard-app.tsx");
  assert.match(source, /view: "operations"/);
  assert.match(source, /OperationsView/);
  assert.match(source, /fetchOperationalSnapshot/);
});
