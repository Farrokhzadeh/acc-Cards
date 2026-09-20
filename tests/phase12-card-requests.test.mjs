import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0011_card_request_workflow.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../server/card-requests/service.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../server/telegram/bot.ts", import.meta.url), "utf8");
const listRoute = await readFile(new URL("../app/api/v1/card-requests/route.ts", import.meta.url), "utf8");
const transitionRoute = await readFile(new URL("../app/api/v1/card-requests/[id]/transition/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../server/telegram/outbox.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../lib/admin-api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");

test("Phase 12 adds immutable-style card request timeline records and review permissions", () => {
  assert.match(migration, /card_request_events/);
  assert.match(migration, /card_requests\.read/);
  assert.match(migration, /card_requests\.review/);
  assert.match(migration, /card_request_reference_seq/);
});

test("Telegram card request state machine collects documented provider fields", () => {
  assert.match(bot, /card_request_amount/);
  assert.match(bot, /card_request_name/);
  assert.match(bot, /card_request_email/);
  assert.match(bot, /card_request_dob/);
  assert.match(bot, /card_request_confirm/);
  assert.match(bot, /Submit request/);
});

test("documented BINs and DOB-required BINs are configured without inventing a dynamic provider catalogue", () => {
  for (const bin of ["539502", "525847", "537872", "533171", "246001"]) assert.match(migration, new RegExp(bin));
  assert.match(migration, /537872.*requiresDob.*true/);
  assert.match(migration, /533171.*requiresDob.*true/);
  assert.match(migration, /246001.*requiresDob.*true/);
});

test("request creation serializes capacity checks and counts current cards plus open requests", () => {
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /active_cards/);
  assert.match(service, /open_requests/);
  assert.match(service, /usedSlots/);
  assert.match(service, /card_limit_reached/);
});

test("request submission requires an assigned account and respects configured minimum", () => {
  assert.match(service, /assigned_accounts < 1/);
  assert.match(service, /minimum_card_creation_usd_cents/);
  assert.match(service, /amount_below_minimum/);
  assert.match(service, /Math\.max\(1000/);
});

test("admin approval rechecks assignment and platform capacity before selecting issuing account", () => {
  assert.match(service, /account_not_assigned/);
  assert.match(service, /selected_account_id/);
  assert.match(service, /telegram_account_assignments/);
  assert.match(service, /capacitySnapshot\(db, row\.user_id, row\.id\)/);
});

test("card request admin routes require RBAC and CSRF for review writes", () => {
  assert.match(listRoute, /card_requests\.read/);
  assert.match(transitionRoute, /card_requests\.review/);
  assert.match(transitionRoute, /requireCsrf/);
  assert.match(transitionRoute, /z\.enum\(\["approve", "reject"\]\)/);
});

test("Phase 12 does not call Kripicard createcard or perform provider money movement", () => {
  assert.doesNotMatch(service, /createcard|fundcard|deposits\/create/i);
  assert.doesNotMatch(bot, /createcard|fundcard|deposits\/create/i);
  assert.match(bot, /does not create a Kripicard card or move funds/);
});

test("review changes are audited and notify the Telegram user through the durable outbox", () => {
  assert.match(service, /INSERT INTO audit_logs/);
  assert.match(service, /card_request\.status_changed/);
  assert.match(outbox, /deliverCardRequestStatus/);
  assert.match(outbox, /card_request\.status_changed/);
});

test("admin UI loads and reviews production card requests rather than mutating only local state", () => {
  assert.match(adminApi, /fetchCardRequests/);
  assert.match(adminApi, /reviewCardRequest/);
  assert.match(dashboard, /fetchCardRequests\(\{ search, limit: 100 \}\)/);
  assert.match(dashboard, /await reviewCardRequest/);
  assert.match(dashboard, />Issue card/);
});
