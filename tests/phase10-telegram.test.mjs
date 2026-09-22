import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0009_telegram_bot.sql", import.meta.url), "utf8");
const bot = await readFile(new URL("../server/telegram/bot.ts", import.meta.url), "utf8");
const telegramClient = await readFile(new URL("../server/providers/telegram/client.ts", import.meta.url), "utf8");
const webhookRoute = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../server/telegram/outbox.ts", import.meta.url), "utf8");
const outboxRoute = await readFile(new URL("../app/api/internal/jobs/telegram-outbox/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");
const cardService = await readFile(new URL("../server/providers/kripicard/service.ts", import.meta.url), "utf8");
const messagesRoute = await readFile(new URL("../app/api/v1/clients/[id]/messages/route.ts", import.meta.url), "utf8");
const activateRoute = await readFile(new URL("../app/api/v1/clients/[id]/activate/route.ts", import.meta.url), "utf8");


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
  assert.match(bot, /Misconfigured channels must not silently lock every user out/);
  assert.match(bot, /telegram\.force_join\.check_failed/);
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


test("first-card receipt persistence is atomic and denied receipts are cleaned from private storage", () => {
  assert.match(bot, /setPaymentReceiptPending/);
  assert.match(bot, /payment_status='pending'/);
  assert.match(bot, /DELETE FROM telegram_bot_states/);
  assert.match(bot, /deletePrivateSupportAttachment\(stored\.objectKey\)/);
  assert.match(activateRoute, /deletePrivateSupportAttachment\(user\.payment_receipt_object_key\)/);
});


test("first-card amount declaration and receipt-mode transition are atomic", () => {
  assert.match(bot, /setPaymentAmountAwaitingReceipt/);
  assert.match(bot, /payment_amount_usd_cents=\$2,payment_declared_at=now\(\)/);
  assert.match(bot, /mode='payment_receipt'/);
  assert.doesNotMatch(bot, /async function setPaymentDeclared/);
  assert.doesNotMatch(bot, /async function setPaymentAmount\(/);
});
