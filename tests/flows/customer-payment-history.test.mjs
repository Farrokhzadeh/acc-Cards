import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payments = await readFile(new URL("../../server/payments/service.ts", import.meta.url), "utf8");
const receipts = await readFile(new URL("../../server/payments/receipts.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const messages = await readFile(new URL("../../server/kyc/messages.ts", import.meta.url), "utf8");
const clientPaymentsRoute = await readFile(new URL("../../app/api/v1/clients/[id]/payments/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const workspacePage = await readFile(new URL("../../app/clients/[id]/client-workspace-page.tsx", import.meta.url), "utf8");

test("customer payment history is sourced from the unified ledger with request, card, rate, and receipt metadata", () => {
  assert.match(payments, /listCustomerPaymentsForUser/);
  assert.match(payments, /getCustomerPaymentHistoryDetail/);
  assert.match(payments, /card_request_reference/);
  assert.match(payments, /funding_request_reference/);
  assert.match(payments, /rate_rial_per_usd/);
  assert.match(payments, /customer_pays_rial/);
  assert.match(payments, /receipt_scan_status/);
  assert.match(payments, /first_card/);
  assert.doesNotMatch(payments, /encrypted_api_key|login_email/);
});

test("Telegram payments and requests history includes all payment purposes and hides the internal onboarding request", () => {
  assert.match(messages, /Payments & requests/);
  assert.match(bot, /listCustomerPaymentsForUser/);
  assert.match(bot, /payment\.detail/);
  assert.match(bot, /first_card/);
  assert.match(bot, /additional_card/);
  assert.match(bot, /card_funding/);
  assert.match(bot, /onboarding_card_request_id=cr\.id/);
  assert.match(messages, /Locked rate/);
  assert.match(messages, /Exact rial amount/);
});

test("Telegram receipt viewing is payment-owned, protected, and reusable across all payment purposes", () => {
  assert.match(receipts, /getCustomerPaymentReceiptForTelegram/);
  assert.match(receipts, /cp\.user_id=\$2::uuid/);
  assert.match(receipts, /JOIN receipts r ON r\.id=cp\.receipt_id/);
  assert.match(bot, /payment\.receipt/);
  assert.match(bot, /payment\.upload/);
  assert.match(bot, /getCustomerPaymentReceiptForTelegram/);
  assert.match(bot, /protectContent: true/);
  assert.match(bot, /getPaymentForFundingRequest/);
});

test("admin client detail exposes the same payment ledger without raw receipt storage keys", () => {
  assert.match(clientPaymentsRoute, /payments\.read/);
  assert.match(clientPaymentsRoute, /listCustomerPaymentsForAdmin/);
  assert.match(adminApi, /fetchClientPayments/);
  assert.match(adminApi, /ApiCustomerPaymentHistory/);
  assert.doesNotMatch(dashboard, /ClientFinancialHistorySection/);
  assert.match(workspacePage, /Financial activity/);
  assert.match(workspacePage, /fetchClientPayments/);
  assert.match(workspacePage, /customerPaymentReceiptUrl/);
  assert.doesNotMatch(adminApi, /objectKey/);
});
