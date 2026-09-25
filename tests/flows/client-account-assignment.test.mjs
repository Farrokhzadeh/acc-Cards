import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const initial = await readFile(new URL("../../db/migrations/0001_initial_schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../db/migrations/0010_client_account_assignments.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/clients/assignments.ts", import.meta.url), "utf8");
const collectionRoute = await readFile(new URL("../../app/api/v1/clients/[id]/accounts/route.ts", import.meta.url), "utf8");
const itemRoute = await readFile(new URL("../../app/api/v1/clients/[id]/accounts/[accountId]/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const activateRoute = await readFile(new URL("../../app/api/v1/clients/[id]/activate/route.ts", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../../server/clients/onboarding.ts", import.meta.url), "utf8");


test("database keeps one current Telegram owner per Kripicard account", () => {
  assert.match(initial, /account_id uuid NOT NULL UNIQUE REFERENCES kripi_accounts/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /account_already_assigned/);
  assert.match(service, /23505/);
});

test("Phase 11 adds append-only assignment history", () => {
  assert.match(migration, /telegram_account_assignment_events/);
  assert.match(migration, /event_type IN \('assigned', 'unassigned'\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /clients\.assign/);
});

test("assignable-account search is server-side and excludes accounts owned by another client", () => {
  assert.match(service, /taa\.telegram_user_id IS NULL OR taa\.telegram_user_id = \$1::uuid/);
  assert.match(service, /ILIKE/);
  assert.match(collectionRoute, /searchParams\.get\("search"\)/);
  assert.match(collectionRoute, /listAssignableAccounts/);
});

test("assignment writes require authenticated permission and CSRF", () => {
  assert.match(collectionRoute, /requireAdmin\(request, "clients\.assign"\)/);
  assert.match(collectionRoute, /requireCsrf\(request, session\)/);
  assert.match(itemRoute, /requireAdmin\(request, "clients\.assign"\)/);
  assert.match(itemRoute, /requireCsrf\(request, session\)/);
});

test("admins can assign and unassign provider accounts independently of onboarding", () => {
  assert.match(collectionRoute, /assignAccount\(/);
  assert.match(collectionRoute, /replaceClientAccounts\(/);
  assert.match(collectionRoute, /unassignAccount\(/);
  assert.match(collectionRoute, /unassignAllAccounts\(/);
  assert.match(itemRoute, /assignAccount\(/);
  assert.match(itemRoute, /unassignAccount\(/);
  assert.doesNotMatch(collectionRoute, /assignment_managed_by_onboarding/);
  assert.doesNotMatch(itemRoute, /assignment_managed_by_onboarding/);
  assert.match(onboarding, /assignAccountInTransaction\(/);
});

test("assignment changes produce history and redacted audit records in the same transaction", () => {
  assert.match(service, /insertAssignmentEvents/);
  assert.match(service, /writeAssignmentAudit/);
  assert.match(service, /INSERT INTO audit_logs/);
  assert.doesNotMatch(service, /encrypted_api_key|encrypted_password/);
});

test("onboarding still assigns atomically while admins also have standalone account controls", () => {
  assert.match(adminApi, /fetchClientAssignableAccounts/);
  assert.match(adminApi, /assignClientAccount/);
  assert.match(adminApi, /unassignClientAccount/);
  assert.match(dashboard, /Create first card/);
  assert.match(activateRoute, /input\.action === "create_card"/);
  assert.match(onboarding, /assignAccountInTransaction/);
  assert.match(service, /assignAccountInTransaction/);
});

test("Telegram authorization requires completed onboarding and resolves current card ownership", () => {
  assert.match(bot, /paymentStatus !== "complete"/);
  assert.match(bot, /telegram_account_assignments/);
  assert.match(bot, /ownsCard\(user\.id/);
  assert.match(bot, /This card is no longer available/);
});
