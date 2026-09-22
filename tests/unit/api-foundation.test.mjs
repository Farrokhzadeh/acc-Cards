import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pool = await readFile(new URL("../../server/database/pool.ts", import.meta.url), "utf8");
const repos = await readFile(new URL("../../server/repositories/postgres.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../../server/http/api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/api/v1/dashboard/route.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");

test("uses a bounded PostgreSQL pool with transaction support", () => {
  assert.match(pool, /new Pool\(/);
  assert.match(pool, /DATABASE_POOL_MAX/);
  assert.match(pool, /BEGIN/);
  assert.match(pool, /ROLLBACK/);
  assert.match(pool, /COMMIT/);
});

test("repositories use parameterized PostgreSQL queries", () => {
  assert.match(repos, /\$1::uuid/);
  assert.doesNotMatch(repos, /login_email = '\$\{/);
  assert.match(repos, /PgAccountRepository/);
  assert.match(repos, /PgCardRepository/);
  assert.match(repos, /PgTelegramUserRepository/);
});

test("API has correlation IDs and consistent error codes", () => {
  assert.match(api, /x-request-id/);
  assert.match(api, /validation_error/);
  assert.match(api, /conflict/);
  assert.match(api, /internal_error/);
});

test("dashboard endpoint returns safe backend records and UI consumes it", () => {
  assert.match(dashboard, /serializeAccount/);
  assert.match(dashboard, /serializeCard/);
  assert.match(dashboard, /serializeClient/);
  assert.match(ui, /fetchDashboardSnapshot/);
  assert.match(ui, /createAccount/);
  assert.match(ui, /setCardFrozenState/);
});
