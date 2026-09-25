import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0032_admin_direct_card_operations.sql", import.meta.url), "utf8");
const directService = await readFile(new URL("../../server/cards/admin-direct.ts", import.meta.url), "utf8");
const directRoute = await readFile(new URL("../../app/api/v1/clients/[id]/cards/direct/route.ts", import.meta.url), "utf8");
const issuance = await readFile(new URL("../../server/card-requests/issuance.ts", import.meta.url), "utf8");
const accountRoute = await readFile(new URL("../../app/api/v1/clients/[id]/accounts/route.ts", import.meta.url), "utf8");
const accountItemRoute = await readFile(new URL("../../app/api/v1/clients/[id]/accounts/[accountId]/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../../app/clients/[id]/client-workspace-page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");

test("database distinguishes admin-direct operations from customer and onboarding card requests", () => {
  assert.match(migration, /origin text NOT NULL DEFAULT 'customer'/);
  assert.match(migration, /'customer','onboarding','admin_direct'/);
  assert.match(migration, /SET origin='onboarding'/);
  assert.match(migration, /cards\.create_direct/);
  assert.match(migration, /clients\.assign/);
});

test("admin direct creation creates an internal operation record without customer payment", () => {
  assert.match(directService, /origin/);
  assert.match(directService, /'admin_direct'/);
  assert.match(directService, /Direct admin card creation/);
  assert.match(directService, /assignAccountInTransaction/);
  assert.match(directService, /getCardRequestBins/);
  assert.doesNotMatch(directService, /createCustomerPayment|assertAcceptedPayment/);
});

test("direct creation keeps live-provider safety gates and recent admin reauthentication", () => {
  assert.match(directRoute, /cards\.create_direct/);
  assert.match(directRoute, /requireCsrf/);
  assert.match(directRoute, /requireRecentReauthentication/);
  assert.match(directRoute, /provider_wallet_confirmation_required/);
  assert.match(directRoute, /assertCardCreationAvailable/);
  assert.match(directRoute, /issueApprovedCardRequest/);
  assert.match(issuance, /ENABLE_KRIPICARD_CARD_CREATION/);
  assert.match(issuance, /assertProviderMoneyReadiness\("card_create"\)/);
  assert.match(issuance, /row\.origin === "admin_direct"/);
  assert.match(issuance, /row\.origin !== "admin_direct"/);
  assert.match(issuance, /needs_reconciliation/);
});

test("customer-paid card requests retain payment gates while admin-direct operations bypass only that customer prerequisite", () => {
  assert.match(issuance, /assertAcceptedPaymentForCardRequest/);
  assert.match(issuance, /if \(row\.origin === "admin_direct"\) return null/);
  assert.match(issuance, /if \(row\.origin !== "admin_direct"\)/);
  assert.match(issuance, /markCardRequestPaymentCompleted/);
});

test("standalone provider-account assignment is restored for admins and keeps ownership conflict protection in the service", () => {
  assert.match(accountRoute, /assignAccount/);
  assert.match(accountRoute, /replaceClientAccounts/);
  assert.match(accountRoute, /unassignAccount/);
  assert.match(accountRoute, /unassignAllAccounts/);
  assert.match(accountItemRoute, /assignAccount/);
  assert.match(accountItemRoute, /unassignAccount/);
  assert.doesNotMatch(accountRoute, /assignment_managed_by_onboarding/);
  assert.doesNotMatch(accountItemRoute, /assignment_managed_by_onboarding/);
});

test("full customer page provides direct card creation, account management, and interactive reauthentication", () => {
  assert.match(adminApi, /createAdminDirectCard/);
  assert.match(adminApi, /assignClientAccount/);
  assert.match(adminApi, /unassignClientAccount/);
  assert.match(workspace, /Create card directly/);
  assert.match(workspace, /Manage provider accounts/);
  assert.match(workspace, /No customer card request or customer payment/i);
  assert.match(workspace, /reauthentication_required/);
  assert.match(workspace, /reauthenticateAdmin/);
  assert.match(workspace, /walletConfirmed/);
});

test("admin-direct operations are visible to admins but hidden from Telegram customer request history", () => {
  assert.match(dashboard, /admin direct/);
  assert.match(dashboard, /No customer payment required/);
  assert.match(dashboard, /createCard=1/);
  assert.match(bot, /cr\.origin <> 'admin_direct'/);
  assert.match(issuance, /origin === "admin_direct"/);
});
