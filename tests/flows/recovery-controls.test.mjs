import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("phase 21 migration installs durable emergency controls with safe defaults", () => {
  const sql = read("db/migrations/0020_backup_recovery_kill_switches.sql");
  assert.match(sql, /CREATE TABLE runtime_controls/i);
  for (const key of ["provider_writes", "card_creation", "card_funding", "telegram_sends", "outlook_sync", "gmail_sync", "read_only_mode"]) {
    assert.ok(sql.includes(`'${key}'`), `missing runtime control ${key}`);
  }
  assert.match(sql, /operations\.controls\.manage/);
});

test("deployment environment remains a hard ceiling over database controls", () => {
  const controls = read("server/operations/controls.ts");
  for (const variable of ["ENABLE_LIVE_PROVIDER_WRITES", "ENABLE_KRIPICARD_CARD_CREATION", "ENABLE_KRIPICARD_CARD_FUNDING", "ENABLE_TELEGRAM_SENDS", "ENABLE_OUTLOOK_SYNC", "ENABLE_GMAIL_SYNC", "FORCE_READ_ONLY_MODE"]) {
    assert.ok(controls.includes(variable), `missing environment ceiling ${variable}`);
  }
  assert.match(controls, /row\.enabled && deployment\.allowed/);
  assert.match(controls, /row\.enabled \|\| deployment\.forced/);
});

test("runtime gates cover provider money writes, card state, mail sync, Telegram, and workers", () => {
  const sources = [
    "server/card-requests/issuance.ts",
    "server/funding/execution.ts",
    "server/providers/kripicard/service.ts",
    "server/providers/microsoft/service.ts",
    "server/providers/google/service.ts",
    "server/providers/telegram/client.ts",
    "server/jobs/runner.ts",
  ].map(read).join("\n");
  for (const key of ["provider_writes", "card_creation", "card_funding", "telegram_sends", "outlook_sync", "gmail_sync"]) {
    assert.ok(sources.includes(`\"${key}\"`), `missing enforcement for ${key}`);
  }
});

test("read-only mode blocks mutations but preserves authenticated recovery controls", () => {
  const api = read("server/http/api.ts");
  assert.match(api, /readOnlyModeEnabled/);
  assert.match(api, /read_only_mode/);
  assert.match(api, /operations\/controls/);
  assert.match(api, /email\/outlook\/callback/);
  assert.match(api, /email\/gmail\/callback/);
});

test("Operations UI exposes audited runtime controls", () => {
  const ui = read("app/dashboard-app.tsx");
  const client = read("lib/admin-api.ts");
  assert.match(ui, /Safety controls/);
  assert.match(ui, /onControlAction/);
  assert.match(client, /updateRuntimeControl/);
});
