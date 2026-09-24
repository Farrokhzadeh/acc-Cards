import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0009_telegram_bot.sql", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const telegramClient = await readFile(new URL("../../server/providers/telegram/client.ts", import.meta.url), "utf8");
const webhookRoute = await readFile(new URL("../../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../../server/telegram/outbox.ts", import.meta.url), "utf8");
const outboxRoute = await readFile(new URL("../../app/api/internal/jobs/telegram-outbox/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../../config/env-schema.mjs", import.meta.url), "utf8");
const cardService = await readFile(new URL("../../server/providers/kripicard/service.ts", import.meta.url), "utf8");
const messagesRoute = await readFile(new URL("../../app/api/v1/clients/[id]/messages/route.ts", import.meta.url), "utf8");
const activateRoute = await readFile(new URL("../../app/api/v1/clients/[id]/activate/route.ts", import.meta.url), "utf8");
const kycService = await readFile(new URL("../../server/kyc/service.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const telegramProvider = await readFile(new URL("../../server/providers/telegram/client.ts", import.meta.url), "utf8");
const payments = await readFile(new URL("../../server/payments/service.ts", import.meta.url), "utf8");
const paymentReceipts = await readFile(new URL("../../server/payments/receipts.ts", import.meta.url), "utf8");
const paymentMigration = await readFile(new URL("../../db/migrations/0030_customer_payments.sql", import.meta.url), "utf8");


test("Phase 10 adds persistent force-join, callback token, and bot-state tables", () => {
  assert.match(migration, /force_join_channels/);
  assert.match(migration, /telegram_callback_tokens/);
  assert.match(migration, /telegram_bot_states/);
  assert.match(migration, /messages_inbound_telegram_message_uq/);
});

test("Telegram webhook verifies Telegram secret before processing and hashes the payload", () => {
  assert.match(webhookRoute, /x-telegram-bot-api-secret-token/i);
  assert.match(webhookRoute, /timingSafeEqual/);
  assert.match(webhookRoute, /sha256/);
  assert.match(webhookRoute, /processTelegramUpdate/);
});

test("Telegram update processing is deduplicated by update_id", () => {
  assert.match(bot, /webhook_events/);
  assert.match(bot, /source, external_id/);
  assert.match(bot, /update\.update_id/);
  assert.match(bot, /ON CONFLICT \(source, external_id\)/);
});

test("callback data is opaque, hashed, user-bound, and expiring", () => {
  assert.match(bot, /tgcb_/);
  assert.match(bot, /sha256Hex\(token\)/);
  assert.match(bot, /user_id = \$2::uuid/);
  assert.match(bot, /expires_at/);
  assert.doesNotMatch(bot, /callback_data:\s*card\.id/);
});

test("bot rechecks ban, force-join membership, and completed first-card onboarding", () => {
  assert.match(bot, /user\.bannedAt/);
  assert.match(bot, /getChatMember/);
  assert.match(bot, /paymentStatus !== "complete"/);
  assert.match(bot, /userCards\(user\.id\)/);
});

test("misconfigured force-join checks fail open instead of locking every user out", () => {
  assert.match(bot, /catch \(error\)[\s\S]*telegram\.force_join\.check_failed/);
  assert.match(bot, /telegram\.force_join\.check_failed/);
});

test("pending customers get a restricted setup menu and can review their own onboarding data", () => {
  assert.match(bot, /waitingKeyboard/);
  assert.match(bot, /setup\.status/);
  assert.match(bot, /setup\.kyc/);
  assert.match(bot, /setup\.receipt/);
  assert.match(bot, /readPrivateReceipt/);
  assert.match(bot, /protectContent: true/);
});

test("support remains usable before first-card onboarding completes", () => {
  assert.match(bot, /resolved\.action === "support\.start"/);
  assert.match(bot, /if \(await supportMode\(user\.id\)\)/);
  assert.match(bot, /DELETE FROM telegram_bot_states WHERE user_id=\$1::uuid AND mode='support'/);
});

test("Telegram reveals full card details only for the current owner and does not persist protected card data", () => {
  assert.match(bot, /card\.reveal/);
  assert.match(bot, /Show full card info/);
  assert.match(bot, /getLiveKripicardCardDetailsForTelegram/);
  assert.match(bot, /protectContent: true/);
  assert.match(bot, /if \(!args\.protectContent\) logChatMessage/);
  assert.match(cardService, /getLiveKripicardCardDetailsForTelegram/);
  assert.match(cardService, /telegram_account_assignments/);
  assert.match(cardService, /client\.cardDetails/);
  assert.match(cardService, /card\.provider\.sensitive_reveal/);
  assert.doesNotMatch(cardService, /metadata: \{[^}]*cardNumber|metadata: \{[^}]*cvv/s);
});

test("Telegram card freeze/unfreeze rechecks ownership and keeps no-blind-retry semantics", () => {
  assert.match(cardService, /setKripicardCardFrozenStateForTelegram/);
  assert.match(cardService, /telegram_account_assignments/);
  assert.match(cardService, /isAmbiguousWriteError/);
  assert.match(cardService, /needs_reconciliation/);
});

test("OTP delivery resolves current assignment again and redacts code after delivery", () => {
  assert.match(outbox, /telegram_account_assignments/);
  assert.match(outbox, /decryptSecret\(otp\.encrypted_code\)/);
  assert.match(outbox, /encrypted_code=''/);
  assert.match(outbox, /redacted_at=now\(\)/);
  assert.doesNotMatch(outbox, /console\.log.*code/s);
});

test("Telegram outbox worker has bounded retries and a protected job endpoint", () => {
  assert.match(outbox, /MAX_ATTEMPTS = 5/);
  assert.match(outbox, /FOR UPDATE SKIP LOCKED/);
  assert.match(outbox, /dead_letter/);
  assert.match(outboxRoute, /timingSafeEqual/);
  assert.match(outboxRoute, /TELEGRAM_OUTBOX_JOB_SECRET/);
});

test("admin support replies are persisted before an outbox event is created", () => {
  assert.match(messagesRoute, /INSERT INTO messages/);
  assert.match(messagesRoute, /support\.admin_message/);
  assert.match(messagesRoute, /outbox_events/);
  assert.match(messagesRoute, /messaging\.send/);
});

test("Telegram credentials stay in environment configuration, not browser code", () => {
  assert.match(env, /TELEGRAM_BOT_TOKEN/);
  assert.match(env, /TELEGRAM_WEBHOOK_SECRET/);
  assert.match(telegramClient, /process\.env/);
  assert.doesNotMatch(bot, /123456789:AA/);
});


test("first-card receipts use the shared payment ledger and private receipt storage", () => {
  assert.match(paymentMigration, /CREATE TABLE IF NOT EXISTS customer_payments/);
  assert.match(paymentMigration, /first_card_payment_id/);
  assert.match(paymentReceipts, /attachTelegramCustomerPaymentReceipt/);
  assert.match(paymentReceipts, /INSERT INTO receipts/);
  assert.match(paymentReceipts, /payment_id/);
  assert.match(paymentReceipts, /withTransaction/);
  assert.match(paymentReceipts, /deletePrivateReceipt/);
  assert.match(bot, /attachTelegramCustomerPaymentReceipt/);
  assert.match(bot, /readPrivateReceipt/);
  assert.doesNotMatch(bot, /setPaymentReceiptPending/);
});


test("first-card payment snapshots the exchange rate before receipt collection", () => {
  assert.match(bot, /createFirstCardPayment/);
  assert.match(bot, /"payment_receipt", \{ paymentId: payment\.id \}/);
  assert.match(bot, /Locked rate/);
  assert.match(payments, /currentPaymentRate/);
  assert.match(payments, /rate_rial_per_usd/);
  assert.match(payments, /customer_pays_rial/);
  assert.match(payments, /purpose: "first_card"/);
  assert.doesNotMatch(bot, /setPaymentAmountAwaitingReceipt/);
});

test("stale payment callbacks cannot regress an accepted or completed onboarding", () => {
  assert.match(payments, /row\.payment_status && row\.payment_status !== "denied"/);
  assert.match(paymentReceipts, /\["pending_receipt","correction_needed"\]/);
  assert.match(bot, /if \(ps !== null && ps !== "denied"\)/);
  assert.match(activateRoute, /reviewCustomerPayment/);
});

test("first-card provider actions require an admin-accepted payment record", () => {
  assert.match(activateRoute, /assertAcceptedFirstCardPayment/);
  assert.match(activateRoute, /reviewCustomerPayment/);
  assert.match(activateRoute, /markFirstCardPaymentCompleted/);
  assert.match(payments, /payment_not_approved/);
});

test("KYC review is a single atomic decision with its audit and notification", () => {
  assert.match(kycService, /withTransaction/);
  assert.match(kycService, /WHERE id = \$1::uuid AND status = 'pending'/);
  assert.match(kycService, /already_reviewed/);
  assert.match(kycService, /INSERT INTO audit_logs/);
  assert.match(kycService, /INSERT INTO outbox_events/);
});

test("Request Center shows first-card work instead of an empty funding table", () => {
  assert.match(dashboard, /value="onboarding"/);
  assert.match(dashboard, /First cards/);
  assert.match(dashboard, /paymentStatusByUser/);
  assert.match(dashboard, /clientReceiptUrl\(client\.id\)/);
  assert.match(dashboard, /onPaymentDecision\(client\.id, "accept"\)/);
  assert.match(dashboard, /onPaymentDecision\(client\.id, "deny"\)/);
  assert.match(dashboard, /No existing-card funding requests/);
});

test("Telegram transport uses grammY while domain processing remains durable", () => {
  assert.match(telegramProvider, /from "grammy"/);
  assert.match(telegramProvider, /new Api/);
  assert.match(bot, /webhook_events/);
  assert.match(bot, /ON CONFLICT \(source, external_id\)/);
});
