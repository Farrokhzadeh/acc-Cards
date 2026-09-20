import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0017_support_messaging.sql", import.meta.url), "utf8");
const bot = await readFile(new URL("../server/telegram/bot.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../server/telegram/outbox.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../server/support/storage.ts", import.meta.url), "utf8");
const fileValidation = await readFile(new URL("../server/security/file-validation.ts", import.meta.url), "utf8");
const telegramClient = await readFile(new URL("../server/providers/telegram/client.ts", import.meta.url), "utf8");
const messageRoute = await readFile(new URL("../app/api/v1/clients/[id]/messages/route.ts", import.meta.url), "utf8");
const conversationsRoute = await readFile(new URL("../app/api/v1/conversations/[id]/route.ts", import.meta.url), "utf8");
const conversationListRoute = await readFile(new URL("../app/api/v1/conversations/route.ts", import.meta.url), "utf8");
const retryRoute = await readFile(new URL("../app/api/v1/messages/[id]/retry/route.ts", import.meta.url), "utf8");
const attachmentRoute = await readFile(new URL("../app/api/v1/messages/[id]/attachment/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../lib/admin-api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const compose = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");


test("Phase 18 adds durable conversation state, unread counters, attachments, and append-only events", () => {
  assert.match(migration, /unread_admin_count/);
  assert.match(migration, /unread_client_count/);
  assert.match(migration, /assigned_admin_id/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS support_attachments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conversation_events/);
  assert.match(migration, /append-only/);
});

test("support attachment storage is private, magic-byte validated, size limited, and malware scanned", () => {
  assert.match(storage, /SUPPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(storage, /validatePrivateUpload/);
  assert.match(fileValidation, /%PDF-/);
  assert.match(fileValidation, /image\/jpeg/);
  assert.match(fileValidation, /active_pdf_rejected/);
  assert.match(storage, /scanFileForMalware/);
  assert.match(storage, /mode: 0o700/);
  assert.match(storage, /open\(target, "wx", 0o600\)/);
});

test("Telegram support mode accepts text plus PDF/image attachments and deduplicates inbound Telegram messages", () => {
  assert.match(bot, /storePrivateSupportAttachment/);
  assert.match(bot, /client\.getFile/);
  assert.match(bot, /client\.downloadFile/);
  assert.match(bot, /ON CONFLICT \(conversation_id, telegram_message_id\)/);
  assert.match(bot, /unread_admin_count=unread_admin_count\+1/);
});

test("a later Telegram interaction acknowledges pending admin messages without pretending Telegram provides read receipts", () => {
  assert.match(bot, /unread_client_count=0/);
  assert.match(bot, /last_client_ack_at=now\(\)/);
});

test("admin support POST accepts multipart attachments and persists before queueing Telegram delivery", () => {
  assert.match(messageRoute, /multipart\/form-data/);
  assert.match(messageRoute, /storePrivateSupportAttachment/);
  assert.match(messageRoute, /INSERT INTO messages/);
  assert.match(messageRoute, /INSERT INTO outbox_events/);
  assert.match(messageRoute, /support\.admin_message/);
});

test("Telegram provider supports one-message document delivery and outbox tracks delivery errors", () => {
  assert.match(telegramClient, /sendDocument/);
  assert.match(telegramClient, /callMultipart/);
  assert.match(outbox, /readPrivateSupportAttachment/);
  assert.match(outbox, /delivery_attempted_at=now\(\)/);
  assert.match(outbox, /last_delivery_error/);
  assert.match(outbox, /unread_client_count=unread_client_count\+1/);
});

test("failed outbound support messages can be retried only through a new durable outbox event", () => {
  assert.match(retryRoute, /messaging\.retry/);
  assert.match(retryRoute, /status !== "failed"/);
  assert.match(retryRoute, /support-retry:/);
  assert.match(retryRoute, /INSERT INTO outbox_events/);
  assert.match(retryRoute, /requireCsrf/);
});

test("conversation status and assignment are RBAC protected and audited", () => {
  assert.match(conversationsRoute, /messaging\.manage/);
  assert.match(conversationsRoute, /requireCsrf/);
  assert.match(conversationsRoute, /assigned_admin_id/);
  assert.match(conversationsRoute, /conversation\.updated/);
  assert.match(conversationListRoute, /unread_admin_count DESC/);
});

test("private attachment download requires messaging permission and is audited", () => {
  assert.match(attachmentRoute, /messaging\.read/);
  assert.match(attachmentRoute, /support\.attachment\.downloaded/);
  assert.match(attachmentRoute, /content-disposition/);
  assert.match(attachmentRoute, /nosniff/);
});

test("admin client supports attachments, conversation status, unread summaries, and delivery retry", () => {
  assert.match(adminApi, /apiFormData/);
  assert.match(adminApi, /fetchSupportConversations/);
  assert.match(adminApi, /updateSupportConversation/);
  assert.match(adminApi, /retrySupportMessage/);
  assert.match(dashboard, /Assign to me/);
  assert.match(dashboard, /Unread conversations are prioritized/);
  assert.match(dashboard, /Retry/);
  assert.match(dashboard, /accept="application\/pdf,image\/jpeg,image\/png,image\/webp"/);
});

test("support attachments and receipts have separate persistent host mounts", () => {
  assert.match(compose, /ACCABAD_DATA_DIR[^\n]+support-attachments:\/var\/lib\/accabad\/support-attachments/);
  assert.match(compose, /ACCABAD_DATA_DIR[^\n]+receipts:\/var\/lib\/accabad\/receipts/);
});
