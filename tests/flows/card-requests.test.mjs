import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0011_card_request_workflow.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/card-requests/service.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const listRoute = await readFile(new URL("../../app/api/v1/card-requests/route.ts", import.meta.url), "utf8");
const transitionRoute = await readFile(new URL("../../app/api/v1/card-requests/[id]/transition/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../../server/telegram/outbox.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const payments = await readFile(new URL("../../server/payments/service.ts", import.meta.url), "utf8");
const paymentReceipts = await readFile(new URL("../../server/payments/receipts.ts", import.meta.url), "utf8");

test("Phase 12 adds immutable-style card request timeline records and review permissions", () => {
  assert.match(migration, /card_request_events/);
  assert.match(migration, /card_requests\.read/);
  assert.match(migration, /card_requests\.review/);
  assert.match(migration, /card_request_reference_seq/);
});

test("Telegram exposes a customer-only additional-card request flow without account or BIN selection", () => {
  assert.match(bot, /async function beginCardRequest/);
  assert.match(bot, /handleCardRequestText/);
  assert.match(bot, /createTelegramCardRequest/);
  assert.match(bot, /card_request_confirm/);
  assert.match(bot, /menu\.request_card/);
  assert.match(bot, /cardreq\.submit/);
  assert.doesNotMatch(bot, /Additional card requests are not available/);
});

test("documented BINs and DOB-required BINs are configured without inventing a dynamic provider catalogue", () => {
  for (const bin of ["539502", "525847", "537872", "533171", "246001"]) assert.match(migration, new RegExp(bin));
  assert.match(migration, /537872.*requiresDob.*true/);
  assert.match(migration, /533171.*requiresDob.*true/);
  assert.match(migration, /246001.*requiresDob.*true/);
});

test("request creation stays serialized without enforcing an automatic card-count limit", () => {
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /FOR UPDATE/);
  assert.doesNotMatch(service, /platform_card_limit|platformLimit|card_limit_reached/);
});

test("request submission uses approved KYC and configured minimum without requiring a preassigned account", () => {
  assert.match(service, /latestApprovedKyc/);
  assert.match(service, /status='approved'/);
  assert.match(service, /minimum_card_creation_usd_cents/);
  assert.match(service, /amount_below_minimum/);
  assert.match(service, /Math\.max\(1000/);
  assert.doesNotMatch(service, /account_assignment_required/);
});

test("additional-card requests require a customer payment receipt before admin approval", () => {
  assert.match(service, /createCustomerPaymentInTransaction/);
  assert.match(service, /purpose: "additional_card"/);
  assert.match(service, /assertAcceptedPaymentForCardRequest/);
  assert.match(bot, /card_request_receipt/);
  assert.match(bot, /cardreq\.upload_receipt/);
  assert.match(bot, /attachTelegramCustomerPaymentReceipt/);
  assert.match(paymentReceipts, /pending_review/);
  assert.match(payments, /payment_not_approved/);
  assert.match(dashboard, /Accept payment/);
  assert.match(dashboard, /customerPaymentReceiptUrl/);
});

test("admin approval chooses BIN and internally assigns the issuing account without a card-count limit", () => {
  assert.match(service, /assertAcceptedPaymentForCardRequest/);
  assert.match(service, /selectedBin/);
  assert.match(service, /bin_required/);
  assert.match(service, /assignAccountInTransaction/);
  assert.match(service, /selected_account_id/);
  assert.match(service, /availableBins/);
  assert.doesNotMatch(service, /platform_card_limit|platformLimit|card_limit_reached/);
});

test("card-request history and review routes are active and protected", () => {
  assert.match(listRoute, /card_requests\.read/);
  assert.match(transitionRoute, /card_requests\.review/);
  assert.match(transitionRoute, /requireCsrf/);
  assert.match(transitionRoute, /reviewCardRequest\(/);
  assert.match(transitionRoute, /selectedBin/);
  assert.doesNotMatch(transitionRoute, /card_request_flow_disabled/);
});

test("card-request review remains provider-write free until the explicit issuance action", () => {
  assert.doesNotMatch(service, /createcard|fundcard|deposits\/create/i);
  assert.match(bot, /createTelegramCardRequest/);
});

test("review changes are audited and notify the Telegram user through the durable outbox", () => {
  assert.match(service, /INSERT INTO audit_logs/);
  assert.match(service, /card_request\.status_changed/);
  assert.match(outbox, /deliverCardRequestStatus/);
  assert.match(outbox, /card_request\.status_changed/);
});

test("additional-card requests are reachable from Telegram and managed from the admin request center", () => {
  assert.match(dashboard, /fetchCardRequests\(/);
  assert.match(dashboard, /reviewCardRequest/);
  assert.match(dashboard, /Issue card/);
  assert.match(dashboard, /New cards/);
  assert.match(dashboard, /Internal account/);
  assert.match(bot, /Request a new card/);
  assert.match(bot, /My requests/);
  assert.doesNotMatch(transitionRoute, /card_request_flow_disabled/);
});
