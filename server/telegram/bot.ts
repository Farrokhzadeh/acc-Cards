import { z } from "zod";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { randomToken, sha256Hex } from "@/server/security/crypto";
import { TelegramClient, type TelegramInlineKeyboard } from "@/server/providers/telegram/client";
import { getLiveKripicardCardDetailsForTelegram, listStoredCardTransactions, setKripicardCardFrozenStateForTelegram } from "@/server/providers/kripicard/service";
import { cancelTelegramFundingRequest, createTelegramFundingRequest, getFundingPolicy, getTelegramFundingRequest, previewFundingQuote } from "@/server/funding/service";
import { cancelTelegramCardRequest, createTelegramCardRequest, getCardRequestPolicy, getTelegramCardRequest } from "@/server/card-requests/service";
import { attachTelegramReceipt } from "@/server/funding/receipts";
import { createFirstCardPayment, getCustomerPaymentHistoryDetail, getPaymentForFundingRequest, listCustomerPaymentsForUser } from "@/server/payments/service";
import { attachTelegramCustomerPaymentReceipt, getCustomerPaymentReceiptForTelegram } from "@/server/payments/receipts";
import { deletePrivateSupportAttachment, storePrivateSupportAttachment } from "@/server/support/storage";
import { createKycSubmission, getKycStatusForUser } from "@/server/kyc/service";
import { KYC, kycConfirmSummary, pick, render, MENU, COMMON, PAYMENT, FLOW, BOT } from "@/server/kyc/messages";
import { getPaymentCard } from "@/server/settings/payment-card";
import { getFirstCardSettings } from "@/server/settings/first-card";
import { getTelegramClient } from "@/server/telegram/credentials";
import { imageForRenderedBotText, refreshBotTextRuntime } from "@/server/telegram/text-management";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional().default(""),
  last_name: z.string().optional(),
  username: z.string().optional(),
});
const messageSchema = z.object({
  message_id: z.number().int().positive(),
  from: telegramUserSchema.optional(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(z.object({
    file_id: z.string().min(1),
    file_unique_id: z.string().min(1),
    file_size: z.number().int().positive().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })).optional(),
  document: z.object({
    file_id: z.string().min(1),
    file_unique_id: z.string().min(1),
    file_name: z.string().optional(),
    mime_type: z.string().optional(),
    file_size: z.number().int().positive().optional(),
  }).optional(),
}).passthrough();
const callbackSchema = z.object({
  id: z.string().min(1),
  from: telegramUserSchema,
  data: z.string().optional(),
  message: messageSchema.optional(),
}).passthrough();
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: messageSchema.optional(),
  callback_query: callbackSchema.optional(),
}).passthrough();
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
type TelegramUserInput = z.infer<typeof telegramUserSchema>;

type BotUser = {
  id: string;
  telegramUserId: bigint;
  username: string | null;
  displayName: string | null;
  bannedAt: Date | null;
  lang: string | null;
};

type CallbackRow = {
  id: string;
  user_id: string;
  action: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  single_use: boolean;
  expires_at: Date;
  consumed_at: Date | null;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function displayName(user: TelegramUserInput) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || `Telegram ${user.id}`;
}

async function auditTelegramEvent(args: { userId?: string | null; action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown>; requestId?: string | null }) {
  await getPool().query(
    `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, request_id)
     VALUES ('telegram_user', $1::uuid, $2, $3, $4, $5::jsonb, $6)`,
    [args.userId ?? null, args.action, args.entityType, args.entityId ?? null, JSON.stringify(args.metadata ?? {}), args.requestId ?? null],
  );
}

async function upsertTelegramUser(input: TelegramUserInput): Promise<BotUser> {
  const result = await getPool().query<{
    id: string; telegram_user_id: string | bigint; username: string | null; display_name: string | null; banned_at: Date | null; lang: string | null;
  }>(
    `INSERT INTO telegram_users(telegram_user_id, username, display_name, first_name, last_name, last_seen_at)
     VALUES ($1::bigint, $2, $3, $4, $5, now())
     ON CONFLICT (telegram_user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       last_seen_at = now(),
       updated_at = now()
     RETURNING id, telegram_user_id, username, display_name, banned_at, lang`,
    [String(input.id), input.username ?? null, displayName(input), input.first_name || null, input.last_name ?? null],
  );
  const row = result.rows[0]!;
  return {
    id: row.id,
    telegramUserId: typeof row.telegram_user_id === "bigint" ? row.telegram_user_id : BigInt(row.telegram_user_id),
    username: row.username,
    displayName: row.display_name,
    bannedAt: row.banned_at,
    lang: row.lang,
  };
}

async function setUserLang(userId: string, lang: string) {
  await getPool().query(`UPDATE telegram_users SET lang = $2, updated_at = now() WHERE id = $1::uuid`, [userId, lang]);
}

async function getPaymentStatus(userId: string): Promise<string | null> {
  const r = await getPool().query<{ payment_status: string | null }>(
    `SELECT payment_status FROM telegram_users WHERE id = $1::uuid`,
    [userId],
  );
  return r.rows[0]?.payment_status ?? null;
}

async function handlePaymentAmountText(client: TelegramClient, user: BotUser, chatId: number, text: string): Promise<boolean> {
  const state = await getKycState(user.id);
  if (!state || state.mode !== "payment_amount") return false;
  const cents = dollarsToCents(text.trim());
  if (cents == null || cents <= 0) { await client.sendMessage({ chatId, text: pick(PAYMENT.errAmount, user.lang) }); return true; }
  const [pc, firstCard] = await Promise.all([getPaymentCard(), getFirstCardSettings()]);
  const minCents = Math.round(firstCard.minLoadUsd * 100);
  if (cents < minCents) {
    await client.sendMessage({ chatId, text: pick(PAYMENT.errMinAmount, user.lang).replace("{min}", `${firstCard.minLoadUsd}`) });
    return true;
  }
  if (!pc.cardNumber) {
    await client.sendMessage({ chatId, text: pick(PAYMENT.notConfigured, user.lang) });
    return true;
  }
  const payment = await createFirstCardPayment(user.id, cents);
  await setBotState(user.id, "payment_receipt", { paymentId: payment.id }, 60);
  const amount = (cents / 100).toFixed(2);
  const instructions = pick(PAYMENT.info, user.lang)
    .replace("{amount}", escapeHtml(amount))
    .replace("{card}", escapeHtml(pc.cardNumber))
    .replace("{holder}", escapeHtml(pc.cardHolder || "—"));
  const rateLine = user.lang === "fa"
    ? `نرخ ثبت‌شده: <b>${escapeHtml(BigInt(payment.rateRialPerUsd).toLocaleString("en-US"))}</b> ریال برای هر دلار\nمبلغ دقیق قابل پرداخت: <b>${escapeHtml(formatRialValue(payment.customerPaysRial))}</b>`
    : `Locked rate: <b>${escapeHtml(BigInt(payment.rateRialPerUsd).toLocaleString("en-US"))}</b> rial/USD\nPay exactly: <b>${escapeHtml(formatRialValue(payment.customerPaysRial))}</b>`;
  await client.sendMessage({ chatId, text: `${instructions}\n\n${rateLine}\n\n${pick(PAYMENT.askReceipt, user.lang)}` });
  return true;
}
async function handlePaymentReceiptMedia(client: TelegramClient, user: BotUser, chatId: number, message: z.infer<typeof messageSchema>): Promise<boolean> {
  const state = await getKycState(user.id);
  if (!state || state.mode !== "payment_receipt" || !state.payload?.paymentId) return false;
  const photo = message.photo?.at(-1);
  const document = message.document;
  const selected = document ?? photo;
  if (!selected) { await client.sendMessage({ chatId, text: pick(PAYMENT.askReceipt, user.lang) }); return true; }
  if (document?.mime_type && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(document.mime_type)) {
    await client.sendMessage({ chatId, text: pick(KYC.errDocType, user.lang) });
    return true;
  }
  try {
    await attachTelegramCustomerPaymentReceipt({
      userId: user.id,
      paymentId: state.payload.paymentId,
      telegramFileId: selected.file_id,
      telegramFileUniqueId: selected.file_unique_id,
      originalFilename: document?.file_name ?? `payment-receipt-${message.message_id}.jpg`,
      declaredMimeType: document?.mime_type ?? "image/jpeg",
    });
    await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
    await sendWaitingScreen(client, user, chatId);
  } catch (error) {
    await client.sendMessage({ chatId, text: error instanceof ApiError ? escapeHtml(error.message) : pick(KYC.errDocGeneric, user.lang) });
  }
  return true;
}
async function waitingKeyboard(user: BotUser, includeReceipt: boolean): Promise<TelegramInlineKeyboard> {
  const status = await createCallbackToken({ userId: user.id, action: "setup.status" });
  const kyc = await createCallbackToken({ userId: user.id, action: "setup.kyc" });
  const language = await createCallbackToken({ userId: user.id, action: "menu.lang" });
  const support = await createCallbackToken({ userId: user.id, action: "support.start" });
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [
    [
      { text: pick(MENU.status, user.lang), callback_data: status },
      { text: pick(MENU.kycInfo, user.lang), callback_data: kyc },
    ],
  ];
  if (includeReceipt) {
    rows.push([{ text: pick(MENU.receipt, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "setup.receipt" }) }]);
  }
  rows.push([
    { text: pick(MENU.language, user.lang), callback_data: language },
    { text: pick(MENU.support, user.lang), callback_data: support },
  ]);
  return { inline_keyboard: rows };
}

async function firstCardProgress(userId: string) {
  const result = await getPool().query<{
    payment_status: string | null;
    payment_amount_usd_cents: string | bigint | null;
    payment_receipt_object_key: string | null;
    payment_receipt_mime: string | null;
    payment_receipt_at: Date | null;
    first_card_payment_id: string | null;
    payment_receipt_id: string | null;
  }>(
    `SELECT u.payment_status,u.payment_amount_usd_cents,u.payment_receipt_object_key,u.payment_receipt_mime,u.payment_receipt_at,
              u.first_card_payment_id,cp.receipt_id AS payment_receipt_id
       FROM telegram_users u
       LEFT JOIN customer_payments cp ON cp.id=u.first_card_payment_id
      WHERE u.id=$1::uuid`,
    [userId],
  );
  return result.rows[0] ?? {
    payment_status: null,
    payment_amount_usd_cents: null,
    payment_receipt_object_key: null,
    payment_receipt_mime: null,
    payment_receipt_at: null,
    first_card_payment_id: null,
    payment_receipt_id: null,
  };
}

function customerPaymentStatus(status: string | null, lang: string | null) {
  if (status === "pending") return pick(BOT.onboardingPending, lang);
  if (status === "accepted") return pick(BOT.onboardingAccepted, lang);
  if (status === "card_creating" || status === "card_reconciliation") return pick(BOT.onboardingPreparing, lang);
  if (status === "card_ready") return pick(BOT.onboardingReady, lang);
  if (status === "complete") return pick(BOT.onboardingComplete, lang);
  if (status === "denied") return pick(BOT.onboardingDenied, lang);
  return pick(BOT.onboardingWaitingPayment, lang);
}

async function sendSetupStatus(client: TelegramClient, user: BotUser, chatId: number) {
  const [kycStatus, progress] = await Promise.all([getKycStatusForUser(user.id), firstCardProgress(user.id)]);
  const kycLabel =
    kycStatus === "approved" ? pick(COMMON.kycApproved, user.lang)
    : kycStatus === "pending" ? pick(COMMON.kycPending, user.lang)
    : kycStatus === "rejected" ? pick(COMMON.kycRejected, user.lang)
    : pick(COMMON.kycNone, user.lang);
  const amount = progress.payment_amount_usd_cents == null ? null : formatUsdCents(progress.payment_amount_usd_cents);
  const lines = [
    "<b>" + escapeHtml(pick(MENU.status, user.lang)) + "</b>",
    `${escapeHtml(pick(COMMON.kycStatus, user.lang))} <b>${escapeHtml(kycLabel)}</b>`,
  ];
  if (kycStatus === "approved") {
    lines.push(`💳 <b>${escapeHtml(customerPaymentStatus(progress.payment_status, user.lang))}</b>`);
    if (amount) lines.push(`${escapeHtml(pick(BOT.firstCardAmountLabel, user.lang))}: <b>${escapeHtml(amount)}</b>`);
    if (progress.payment_receipt_at) {
      lines.push(`${escapeHtml(pick(BOT.receiptSubmittedLabel, user.lang))}: ${escapeHtml(progress.payment_receipt_at.toISOString().replace("T", " ").slice(0, 16))} UTC`);
    }
  }
  await client.sendMessage({
    chatId,
    text: lines.join("\n"),
    replyMarkup: await waitingKeyboard(user, Boolean(progress.payment_receipt_object_key)),
  });
}

async function sendKycInfo(client: TelegramClient, user: BotUser, chatId: number) {
  const result = await getPool().query<{
    full_name: string; date_of_birth: Date | string | null; country: string; national_id: string; phone: string;
    delivery_country: string | null; delivery_province: string | null; delivery_city: string | null;
    delivery_address_line: string | null; delivery_postal_code: string | null; status: string; submitted_at: Date;
    document_object_key: string | null;
  }>(
    `SELECT full_name,date_of_birth,country,national_id,phone,delivery_country,delivery_province,delivery_city,delivery_address_line,delivery_postal_code,status,submitted_at,document_object_key
       FROM kyc_submissions
      WHERE telegram_user_id=$1::uuid
      ORDER BY submitted_at DESC,id DESC
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  if (!row) {
    await client.sendMessage({ chatId, text: pick(FLOW.noKycInfo, user.lang), replyMarkup: await waitingKeyboard(user, false) });
    return;
  }
  const dob = row.date_of_birth instanceof Date ? row.date_of_birth.toISOString().slice(0, 10) : String(row.date_of_birth ?? "—").slice(0, 10);
  const deliveryAddress = [
    row.delivery_address_line, row.delivery_city, row.delivery_province, row.delivery_country,
    row.delivery_postal_code ? `Postal/ZIP ${row.delivery_postal_code}` : null,
  ].filter(Boolean).join(", ") || "—";
  const text = render(BOT.kycDetails, user.lang, {
    name: escapeHtml(row.full_name),
    dob: escapeHtml(dob),
    country: escapeHtml(row.country),
    nationalId: escapeHtml(row.national_id),
    phone: escapeHtml(row.phone),
    address: escapeHtml(deliveryAddress),
    status: escapeHtml(row.status),
    document: pick(row.document_object_key ? BOT.documentSubmitted : BOT.documentNotSubmitted, user.lang),
  });
  const progress = await firstCardProgress(user.id);
  await client.sendMessage({ chatId, text, protectContent: true, replyMarkup: await waitingKeyboard(user, Boolean(progress.payment_receipt_object_key)) });
}

async function sendPaymentReceipt(client: TelegramClient, user: BotUser, chatId: number) {
  const progress = await firstCardProgress(user.id);
  if (!progress.first_card_payment_id || !progress.payment_receipt_id) {
    await client.sendMessage({ chatId, text: pick(FLOW.noPaymentReceipt, user.lang), replyMarkup: await waitingKeyboard(user, false) });
    return;
  }
  try {
    const receipt = await getCustomerPaymentReceiptForTelegram(progress.first_card_payment_id, user.id);
    const ext = receipt.mimeType === "application/pdf" ? "pdf" : receipt.mimeType === "image/png" ? "png" : receipt.mimeType === "image/webp" ? "webp" : "jpg";
    await client.sendDocument({
      chatId,
      bytes: receipt.bytes,
      filename: `first-card-payment-receipt.${ext}`,
      mimeType: receipt.mimeType,
      caption: pick(BOT.firstCardReceiptCaption, user.lang),
      protectContent: true,
    });
  } catch {
    await client.sendMessage({ chatId, text: pick(FLOW.noPaymentReceipt, user.lang) });
  }
}

async function sendPaymentScreen(client: TelegramClient, user: BotUser, chatId: number) {
  const [pc, firstCard, menu] = await Promise.all([getPaymentCard(), getFirstCardSettings(), waitingKeyboard(user, false)]);
  const choose = await createCallbackToken({ userId: user.id, action: "menu.paid" });
  const text = pc.cardNumber
    ? pick(PAYMENT.chooseAmount, user.lang).replace("{min}", escapeHtml(String(firstCard.minLoadUsd)))
    : pick(PAYMENT.notConfigured, user.lang);
  await client.sendMessage({
    chatId,
    text: `${text}\n\n${pick(FLOW.waitingMenu, user.lang)}`,
    replyMarkup: { inline_keyboard: [[{ text: pick(MENU.paidBtn, user.lang), callback_data: choose }], ...menu.inline_keyboard] },
  });
}
async function sendWaitingScreen(client: TelegramClient, user: BotUser, chatId: number) {
  const progress = await firstCardProgress(user.id);
  await client.sendMessage({
    chatId,
    text: `${pick(FLOW.waitingActivation, user.lang)}\n\n${pick(FLOW.waitingMenu, user.lang)}`,
    replyMarkup: await waitingKeyboard(user, Boolean(progress.payment_receipt_object_key)),
  });
}
export async function logChatMessage(user: { id: string }, direction: "client_to_admin" | "admin_to_client", text: string) {
  const conv = await getPool().query<{ id: string }>(
    `INSERT INTO conversations(user_id, status, closed_at, updated_at) VALUES ($1::uuid,'open',NULL,now())
     ON CONFLICT (user_id) DO UPDATE SET updated_at=now() RETURNING id`,
    [user.id],
  );
  const conversationId = conv.rows[0]!.id;
  await getPool().query(
    `INSERT INTO messages(conversation_id, direction, text_body, status, delivered_at) VALUES ($1::uuid,$2,NULLIF($3,''),'delivered',now())`,
    [conversationId, direction, text.slice(0, 4000)],
  );
  await getPool().query(
    direction === "client_to_admin"
      ? `UPDATE conversations SET unread_admin_count=unread_admin_count+1, last_message_at=now(), updated_at=now() WHERE id=$1::uuid`
      : `UPDATE conversations SET last_message_at=now(), updated_at=now() WHERE id=$1::uuid`,
    [conversationId],
  );
}
function withChatLog(client: TelegramClient, user: { id: string; lang: string | null }): TelegramClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "sendMessage" && typeof value === "function") {
        return async (args: { chatId: number; text: string; replyMarkup?: unknown; protectContent?: boolean }) => {
          const image = await imageForRenderedBotText(args.text, user.lang).catch(() => null);
          if (image) {
            await target.sendPhoto({
              chatId: args.chatId,
              bytes: image.bytes,
              filename: image.filename,
              protectContent: args.protectContent,
            });
          }
          const result = await (value as (a: unknown) => Promise<unknown>).call(target, args);
          if (!args.protectContent) logChatMessage(user, "admin_to_client", args.text).catch(() => {});
          return result;
        };
      }
      return value;
    },
  }) as TelegramClient;
}

async function settingValue<T>(key: string, fallback: T): Promise<T> {
  const result = await getPool().query<{ typed_value: T }>(`SELECT typed_value FROM settings WHERE key = $1`, [key]);
  return result.rows[0]?.typed_value ?? fallback;
}

export async function createCallbackToken(args: {
  userId: string;
  action: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  singleUse?: boolean;
  ttlMinutes?: number;
}) {
  const env = parseServerEnv(process.env);
  const token = `tgcb_${randomToken(18)}`;
  await getPool().query(
    `INSERT INTO telegram_callback_tokens(token_hash, user_id, action, entity_id, payload, single_use, expires_at)
     VALUES ($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6, now() + ($7::int * interval '1 minute'))`,
    [sha256Hex(token), args.userId, args.action, args.entityId ?? null, JSON.stringify(args.payload ?? {}), args.singleUse ?? false, args.ttlMinutes ?? env.TELEGRAM_CALLBACK_TTL_MINUTES],
  );
  return token;
}

async function resolveCallbackToken(token: string, userId: string): Promise<CallbackRow> {
  if (!/^tgcb_[A-Za-z0-9_-]{12,60}$/.test(token)) throw new ApiError(400, "invalid_callback", "This button is invalid or expired.");
  return withTransaction(async (db) => {
    const result = await db.query<CallbackRow>(
      `SELECT id, user_id, action, entity_id, payload, single_use, expires_at, consumed_at
         FROM telegram_callback_tokens
        WHERE token_hash = $1 AND user_id = $2::uuid
        FOR UPDATE`,
      [sha256Hex(token), userId],
    );
    const row = result.rows[0];
    if (!row || row.expires_at.getTime() <= Date.now() || row.consumed_at) {
      throw new ApiError(410, "callback_expired", "This button has expired. Open the menu again.");
    }
    if (row.single_use) await db.query(`UPDATE telegram_callback_tokens SET consumed_at = now() WHERE id = $1::uuid`, [row.id]);
    return row;
  });
}

async function forceJoinChannels() {
  const result = await getPool().query<{ chat_id: string; title: string; invite_url: string | null }>(
    `SELECT chat_id, title, invite_url FROM force_join_channels WHERE enabled = true ORDER BY sort_order ASC, created_at ASC`,
  );
  return result.rows;
}

function membershipSatisfied(member: { status: string; is_member?: boolean }) {
  if (["creator", "administrator", "member"].includes(member.status)) return true;
  return member.status === "restricted" && member.is_member !== false;
}

async function checkMembership(client: TelegramClient, user: BotUser) {
  const channels = await forceJoinChannels();
  const missing: Array<{ chatId: string; title: string; inviteUrl: string | null }> = [];
  const warnings: string[] = [];
  for (const channel of channels) {
    try {
      const member = await client.getChatMember(channel.chat_id, user.telegramUserId.toString());
      if (!membershipSatisfied(member)) missing.push({ chatId: channel.chat_id, title: channel.title, inviteUrl: channel.invite_url });
    } catch (error) {
      warnings.push(channel.chat_id);
      await getPool().query(
        `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted)
         VALUES ('system', NULL, 'telegram.force_join.check_failed', 'force_join_channel', $1, $2::jsonb)`,
        [channel.chat_id, JSON.stringify({ errorCode: error instanceof ApiError ? error.code : "unknown" })],
      );
    }
  }
  return { missing, warnings };
}

async function sendJoinGate(client: TelegramClient, user: BotUser, chatId: number, missing: Array<{ chatId: string; title: string; inviteUrl: string | null }>) {
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const channel of missing) {
    const url = channel.inviteUrl || (channel.chatId.startsWith("@") ? `https://t.me/${channel.chatId.slice(1)}` : null);
    if (url) rows.push([{ text: render(BOT.joinChannel, user.lang, { channel: channel.title }), url }]);
  }
  const retry = await createCallbackToken({ userId: user.id, action: "membership.retry" });
  rows.push([{ text: pick(BOT.joinRetry, user.lang), callback_data: retry }]);
  await client.sendMessage({ chatId, text: pick(BOT.joinGate, user.lang), replyMarkup: { inline_keyboard: rows } });
}

async function mainKeyboard(userId: string, lang: string | null): Promise<TelegramInlineKeyboard> {
  const L = (msg: { en: string; fa: string }) => pick(msg, lang);
  const pairs = await Promise.all([
    [L(MENU.cards), "menu.cards"],
    [L(MENU.requestCard), "menu.request_card"],
    [L(MENU.addFunds), "menu.add_funds"],
    [L(MENU.requests), "menu.requests"],
    [L(MENU.support), "support.start"],
    [L(MENU.language), "menu.lang"],
  ].map(async ([text, action]) => ({ text, callback_data: await createCallbackToken({ userId, action }) })));
  return { inline_keyboard: [[pairs[0], pairs[1]], [pairs[2], pairs[3]], [pairs[4], pairs[5]]] };
}

async function sendLangPicker(client: TelegramClient, user: BotUser, chatId: number) {
  const en = await createCallbackToken({ userId: user.id, action: "lang.en" });
  const fa = await createCallbackToken({ userId: user.id, action: "lang.fa" });
  await client.sendMessage({
    chatId,
    text: pick(COMMON.langPicker, user.lang),
    replyMarkup: { inline_keyboard: [[{ text: COMMON.langEn.en, callback_data: en }, { text: COMMON.langFa.fa, callback_data: fa }]] },
  });
}

async function sendPaymentInfo(client: TelegramClient, user: BotUser, chatId: number) {
  const pc = await getPaymentCard();
  if (!pc.cardNumber) {
    await client.sendMessage({ chatId, text: pick(PAYMENT.notConfigured, user.lang) });
    return;
  }
  const text = pick(PAYMENT.info, user.lang)
    .replace("{card}", escapeHtml(pc.cardNumber))
    .replace("{holder}", escapeHtml(pc.cardHolder || "—"));
  await client.sendMessage({ chatId, text });
}
async function routeHome(client: TelegramClient, user: BotUser, chatId: number) {
  if (user.lang === null) { await sendLangPicker(client, user, chatId); return; }
  if (user.bannedAt) { await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) }); return; }
  const st = await getKycStatusForUser(user.id);
  if (st === "none" || st === "rejected") { await sendKycInvite(client, user, chatId); return; }
  if (st === "pending") {
    await client.sendMessage({
      chatId,
      text: `${pick(KYC.alreadyPending, user.lang)}\n\n${pick(FLOW.waitingMenu, user.lang)}`,
      replyMarkup: await waitingKeyboard(user, false),
    });
    return;
  }
  const pstat = await getPaymentStatus(user.id);
  if (pstat === "complete" && (await userCards(user.id)).length > 0) { await sendMainMenu(client, user, chatId); return; }
  if (!pstat || pstat === "denied") { await sendPaymentScreen(client, user, chatId); return; }
  await sendWaitingScreen(client, user, chatId);
}

async function sendMainMenu(client: TelegramClient, user: BotUser, chatId: number) {
  await getPool().query(
    `INSERT INTO telegram_bot_states(user_id, mode, payload, expires_at, updated_at)
     VALUES ($1::uuid, 'idle', '{}'::jsonb, NULL, now())
     ON CONFLICT (user_id) DO UPDATE SET mode='idle', payload='{}'::jsonb, expires_at=NULL, updated_at=now()`,
    [user.id],
  );
  const kycStatus = await getKycStatusForUser(user.id);
  const kycLabel =
    kycStatus === "approved" ? pick(COMMON.kycApproved, user.lang)
    : kycStatus === "pending" ? pick(COMMON.kycPending, user.lang)
    : kycStatus === "rejected" ? pick(COMMON.kycRejected, user.lang)
    : pick(COMMON.kycNone, user.lang);
  await client.sendMessage({
    chatId,
    text: `${pick(COMMON.welcome, user.lang)}${user.displayName ? `, <b>${escapeHtml(user.displayName)}</b>` : ""}. ${pick(COMMON.chooseOption, user.lang)}\n${pick(COMMON.kycStatus, user.lang)} <b>${kycLabel}</b>`,
    replyMarkup: await mainKeyboard(user.id, user.lang),
  });
}

async function assertBotAccess(client: TelegramClient, user: BotUser, chatId: number) {
  if (user.bannedAt) {
    await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) });
    return false;
  }
  const membership = await checkMembership(client, user);
  if (membership.missing.length) {
    await sendJoinGate(client, user, chatId, membership.missing);
    return false;
  }
  const paymentStatus = await getPaymentStatus(user.id);
  if (paymentStatus !== "complete" || (await userCards(user.id)).length === 0) {
    await routeHome(client, user, chatId);
    return false;
  }
  return true;
}

async function userCards(userId: string) {
  const result = await getPool().query<{
    id: string; label: string | null; last4: string | null; status: string; balance_usd_cents: string | bigint | null;
  }>(
    `SELECT c.id, c.label, c.last4, c.status, c.balance_usd_cents
       FROM cards c
       JOIN telegram_account_assignments taa ON taa.account_id = c.account_id
      WHERE taa.telegram_user_id = $1::uuid AND c.archived_at IS NULL
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 25`,
    [userId],
  );
  return result.rows;
}

async function ownsCard(userId: string, cardId: string) {
  const result = await getPool().query<{
    id: string; label: string | null; last4: string | null; status: string; balance_usd_cents: string | bigint | null;
  }>(
    `SELECT c.id, c.label, c.last4, c.status, c.balance_usd_cents
       FROM cards c
       JOIN telegram_account_assignments taa ON taa.account_id = c.account_id
      WHERE c.id = $2::uuid AND taa.telegram_user_id = $1::uuid AND c.archived_at IS NULL`,
    [userId, cardId],
  );
  return result.rows[0] ?? null;
}

function formatUsdCents(value: string | bigint | null) {
  if (value == null) return "Unavailable";
  const cents = typeof value === "bigint" ? value : BigInt(value);
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

async function sendCards(client: TelegramClient, user: BotUser, chatId: number) {
  const cards = await userCards(user.id);
  if (!cards.length) {
    const verify = await createCallbackToken({ userId: user.id, action: "menu.kyc" });
    const pay = await createCallbackToken({ userId: user.id, action: "menu.payment" });
    const home = await createCallbackToken({ userId: user.id, action: "menu.home" });
    await client.sendMessage({
      chatId,
      text: pick(FLOW.emptyCards, user.lang),
      replyMarkup: { inline_keyboard: [[{ text: pick(MENU.verify, user.lang), callback_data: verify }], [{ text: pick(MENU.payment, user.lang), callback_data: pay }], [{ text: pick(MENU.back, user.lang), callback_data: home }]] },
    });
    return;
  }
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const card of cards) {
    const token = await createCallbackToken({ userId: user.id, action: "card.detail", entityId: card.id });
    rows.push([{ text: `${card.status === "frozen" ? "❄️" : "💳"} ${card.label || "Card"} •${card.last4 ?? "????"}`, callback_data: token }]);
  }
  rows.push([{ text: pick(MENU.back, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text: pick(FLOW.cardsHeader, user.lang), replyMarkup: { inline_keyboard: rows } });
}

async function sendCardDetail(client: TelegramClient, user: BotUser, chatId: number, cardId: string) {
  const card = await ownsCard(user.id, cardId);
  if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
  const txToken = await createCallbackToken({ userId: user.id, action: "card.transactions", entityId: card.id });
  const revealToken = await createCallbackToken({ userId: user.id, action: "card.reveal", entityId: card.id, singleUse: true, ttlMinutes: 5 });
  const stateAction = card.status === "frozen" ? "card.unfreeze" : "card.freeze";
  const stateToken = await createCallbackToken({ userId: user.id, action: stateAction, entityId: card.id, singleUse: true, ttlMinutes: 10 });
  const back = await createCallbackToken({ userId: user.id, action: "menu.cards" });
  const stateLabel = card.status === "frozen" ? pick(BOT.unfreeze, user.lang) : pick(BOT.freeze, user.lang);
  await client.sendMessage({
    chatId,
    text: render(BOT.cardDetail, user.lang, { label: escapeHtml(card.label || pick(BOT.defaultCardLabel, user.lang)), last4: escapeHtml(card.last4 ?? "????"), status: escapeHtml(card.status), balance: formatUsdCents(card.balance_usd_cents) }),
    replyMarkup: { inline_keyboard: [[{ text: pick(BOT.showFullCard, user.lang), callback_data: revealToken }], [{ text: pick(BOT.transactions, user.lang), callback_data: txToken }, { text: stateLabel, callback_data: stateToken }], [{ text: pick(BOT.backCards, user.lang), callback_data: back }]] },
  });
}

async function sendFullCardInfo(client: TelegramClient, user: BotUser, chatId: number, cardId: string, requestId: string) {
  const card = await ownsCard(user.id, cardId);
  if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");

  const details = await getLiveKripicardCardDetailsForTelegram(cardId, user.id, requestId);
  const back = await createCallbackToken({ userId: user.id, action: "card.detail", entityId: cardId });
  const holder = details.cardholderName?.trim() || "—";

  await client.sendMessage({
    chatId,
    text: render(BOT.fullCardInfo, user.lang, { number: escapeHtml(details.cardNumber), expiry: escapeHtml(details.expiry), cvv: escapeHtml(details.cvv), holder: escapeHtml(holder), balance: formatUsdCents(details.balanceUsdCents), status: escapeHtml(details.status) }),
    protectContent: true,
    replyMarkup: { inline_keyboard: [[{ text: pick(BOT.backCard, user.lang), callback_data: back }]] },
  });
}

async function sendTransactions(client: TelegramClient, user: BotUser, chatId: number, cardId: string) {
  const card = await ownsCard(user.id, cardId);
  if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
  const items = await listStoredCardTransactions(cardId, 10);
  const lines = items.length ? items.map((tx) => {
    const amount = `${Number(BigInt(tx.amountMinor)) / 100} ${escapeHtml(tx.currency)}`;
    const merchant = escapeHtml(tx.merchant || tx.type || "Transaction");
    return `• ${merchant} — ${amount} — ${escapeHtml(tx.status)}`;
  }).join("\n") : pick(FLOW.emptyTransactions, user.lang);
  const back = await createCallbackToken({ userId: user.id, action: "card.detail", entityId: cardId });
  await client.sendMessage({ chatId, text: render(BOT.recentTransactions, user.lang, { last4: escapeHtml(card.last4 ?? "????"), items: lines }), replyMarkup: { inline_keyboard: [[{ text: pick(BOT.backCard, user.lang), callback_data: back }]] } });
}

function customerPaymentPurposeLabel(purpose: "first_card" | "additional_card" | "card_funding", lang: string | null) {
  if (purpose === "first_card") return pick(BOT.firstCardPurpose, lang);
  if (purpose === "additional_card") return pick(BOT.newCardPurpose, lang);
  return pick(BOT.fundingPurpose, lang);
}

function customerPaymentPurposeIcon(purpose: "first_card" | "additional_card" | "card_funding") {
  return purpose === "first_card" ? "🌟" : purpose === "additional_card" ? "💳" : "➕";
}

async function sendRequests(client: TelegramClient, user: BotUser, chatId: number) {
  const [payments, funding, cards] = await Promise.all([
    listCustomerPaymentsForUser(user.id, 20),
    getPool().query<{ id: string; reference: string; status: string; submitted_at: Date }>(
      `SELECT fr.id,fr.reference,fr.status,fr.submitted_at
         FROM funding_requests fr
        WHERE fr.user_id=$1::uuid
          AND NOT EXISTS (SELECT 1 FROM customer_payments cp WHERE cp.funding_request_id=fr.id)
        ORDER BY fr.submitted_at DESC
        LIMIT 10`,
      [user.id],
    ),
    getPool().query<{ id: string; reference: string; status: string; created_at: Date }>(
      `SELECT cr.id,cr.reference,cr.status,cr.created_at
         FROM card_requests cr
        WHERE cr.user_id=$1::uuid
          AND cr.origin <> 'admin_direct'
          AND NOT EXISTS (SELECT 1 FROM customer_payments cp WHERE cp.card_request_id=cr.id)
          AND NOT EXISTS (SELECT 1 FROM telegram_users tu WHERE tu.id=cr.user_id AND tu.onboarding_card_request_id=cr.id)
        ORDER BY cr.created_at DESC
        LIMIT 10`,
      [user.id],
    ),
  ]);

  const combined = [
    ...payments.map((payment) => ({
      kind: "payment" as const,
      id: payment.id,
      reference: payment.requestReference ?? payment.reference,
      status: payment.status,
      purpose: payment.purpose,
      at: new Date(payment.createdAt),
    })),
    ...funding.rows.map((request) => ({ ...request, kind: "funding" as const, purpose: null, at: request.submitted_at })),
    ...cards.rows.map((request) => ({ ...request, kind: "card" as const, purpose: null, at: request.created_at })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);

  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const item of combined) {
    if (item.kind === "payment") {
      rows.push([{
        text: `${customerPaymentPurposeIcon(item.purpose)} ${item.reference} · ${item.status.replaceAll("_", " ")}`,
        callback_data: await createCallbackToken({ userId: user.id, action: "payment.detail", entityId: item.id }),
      }]);
      continue;
    }
    rows.push([{
      text: `${item.kind === "card" ? "💳" : "➕"} ${item.reference} · ${item.status}`,
      callback_data: await createCallbackToken({
        userId: user.id,
        action: item.kind === "card" ? "cardreq.detail" : "fundreq.detail",
        entityId: item.id,
      }),
    }]);
  }
  const text = combined.length ? pick(FLOW.requestsHeader, user.lang) : pick(FLOW.emptyRequests, user.lang);
  rows.push([{ text: pick(MENU.back, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text, replyMarkup: { inline_keyboard: rows } });
}

async function sendCustomerPaymentDetail(client: TelegramClient, user: BotUser, chatId: number, paymentId: string) {
  const payment = await getCustomerPaymentHistoryDetail(paymentId, user.id);
  const purpose = customerPaymentPurposeLabel(payment.purpose, user.lang);
  const lines = [
    `<b>${customerPaymentPurposeIcon(payment.purpose)} ${escapeHtml(purpose)}</b>`,
    `${escapeHtml(pick(BOT.reference, user.lang))}: <code>${escapeHtml(payment.requestReference ?? payment.reference)}</code>`,
    `${escapeHtml(pick(BOT.paymentReference, user.lang))}: <code>${escapeHtml(payment.reference)}</code>`,
    `${escapeHtml(pick(BOT.paymentStatus, user.lang))}: <b>${escapeHtml(payment.status.replaceAll("_", " "))}</b>`,
  ];
  if (payment.requestStatus) lines.push(`${escapeHtml(pick(BOT.requestStatus, user.lang))}: <b>${escapeHtml(payment.requestStatus.replaceAll("_", " "))}</b>`);
  if (payment.cardLast4) lines.push(`${escapeHtml(pick(BOT.card, user.lang))}: •${escapeHtml(payment.cardLast4)}`);
  lines.push(`${escapeHtml(pick(BOT.cardAmount, user.lang))}: <b>${formatUsdCents(payment.amountUsdCents)}</b>`);
  if (BigInt(payment.providerFeeUsdCents) > 0n) lines.push(`${escapeHtml(pick(BOT.providerFee, user.lang))}: ${formatUsdCents(payment.providerFeeUsdCents)}`);
  if (BigInt(payment.serviceFeeUsdCents) > 0n) lines.push(`${escapeHtml(pick(BOT.serviceFee, user.lang))}: ${formatUsdCents(payment.serviceFeeUsdCents)}`);
  lines.push(`${escapeHtml(pick(BOT.totalUsdBasis, user.lang))}: <b>${formatUsdCents(payment.customerPaysUsdCents)}</b>`);
  lines.push(`${escapeHtml(pick(BOT.lockedRate, user.lang))}: ${escapeHtml(BigInt(payment.rateRialPerUsd).toLocaleString("en-US"))} ${escapeHtml(pick(BOT.rialPerUsd, user.lang))}`);
  lines.push(`${escapeHtml(pick(BOT.exactRialAmount, user.lang))}: <b>${escapeHtml(formatRialValue(payment.customerPaysRial))}</b>`);
  lines.push(`${escapeHtml(pick(BOT.receipt, user.lang))}: ${payment.receipt ? escapeHtml(payment.receipt.scanStatus ?? pick(BOT.stored, user.lang)) : escapeHtml(pick(BOT.notUploaded, user.lang))}`);
  lines.push(`${escapeHtml(pick(BOT.created, user.lang))}: ${escapeHtml(new Date(payment.createdAt).toISOString().replace("T", " ").slice(0, 16))} UTC`);
  if (payment.reviewedAt) lines.push(`${escapeHtml(pick(BOT.reviewed, user.lang))}: ${escapeHtml(new Date(payment.reviewedAt).toISOString().replace("T", " ").slice(0, 16))} UTC`);
  if (payment.adminNote) lines.push(`${escapeHtml(pick(BOT.adminNote, user.lang))}: ${escapeHtml(payment.adminNote)}`);

  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  if (payment.receipt) {
    rows.push([{ text: pick(BOT.viewReceipt, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "payment.receipt", entityId: payment.id }) }]);
  }
  if (["pending_receipt", "correction_needed"].includes(payment.status)) {
    rows.push([{ text: pick(BOT.uploadReceipt, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "payment.upload", entityId: payment.id, ttlMinutes: 20 }) }]);
  }
  if (payment.cardRequestId) rows.push([{ text: pick(BOT.cardRequestDetails, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.detail", entityId: payment.cardRequestId }) }]);
  if (payment.fundingRequestId) rows.push([{ text: pick(BOT.fundingRequestDetails, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "fundreq.detail", entityId: payment.fundingRequestId }) }]);
  rows.push([{ text: pick(BOT.backPayments, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "menu.requests" }) }]);

  await client.sendMessage({ chatId, text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } });
}

async function sendCustomerPaymentReceipt(client: TelegramClient, user: BotUser, chatId: number, paymentId: string) {
  const payment = await getCustomerPaymentHistoryDetail(paymentId, user.id);
  if (!payment.receipt) throw new ApiError(404, "receipt_not_found", "No receipt is attached to this payment.");
  const receipt = await getCustomerPaymentReceiptForTelegram(payment.id, user.id);
  const ext = receipt.mimeType === "application/pdf" ? "pdf" : receipt.mimeType === "image/png" ? "png" : receipt.mimeType === "image/webp" ? "webp" : "jpg";
  await client.sendDocument({
    chatId,
    bytes: receipt.bytes,
    filename: `payment-${payment.reference}.${ext}`,
    mimeType: receipt.mimeType,
    caption: `${customerPaymentPurposeIcon(payment.purpose)} ${escapeHtml(customerPaymentPurposeLabel(payment.purpose, user.lang))} · ${escapeHtml(payment.requestReference ?? payment.reference)}`,
    protectContent: true,
  });
}

async function beginCustomerPaymentReceiptUpload(client: TelegramClient, user: BotUser, chatId: number, paymentId: string) {
  const payment = await getCustomerPaymentHistoryDetail(paymentId, user.id);
  if (!["pending_receipt", "correction_needed"].includes(payment.status)) throw new ApiError(409, "invalid_state", "This payment is not waiting for a receipt.");
  if (payment.purpose === "additional_card" && payment.cardRequestId) {
    await setBotState(user.id, "card_request_receipt", { cardRequestId: payment.cardRequestId, paymentId: payment.id }, 60);
  } else if (payment.purpose === "card_funding" && payment.fundingRequestId) {
    await setBotState(user.id, "funding_request_receipt", { fundingRequestId: payment.fundingRequestId, paymentId: payment.id }, 60);
  } else if (payment.purpose === "first_card") {
    await setKycState(user.id, "payment_receipt", { paymentId: payment.id }, 60);
  } else {
    throw new ApiError(409, "invalid_state", "This payment cannot accept a replacement receipt.");
  }
  await client.sendMessage({ chatId, text: pick(BOT.paymentReceiptUpload, user.lang) });
}

type CardRequestDraftPayload = {
  bin?: string;
  amountUsdCents?: number;
  nameOnCard?: string;
  email?: string;
  dateOfBirth?: string | null;
  cardId?: string;
  rateId?: string;
  quoteRialPerUsd?: string;
  quoteMinimumUsdCents?: number;
  quoteProviderFeeBasisPoints?: number;
  quoteProviderFeeFixedUsdCents?: string;
  quoteServiceFeeBasisPoints?: number;
  quoteExpiresAt?: string;
  fundingRequestId?: string;
  cardRequestId?: string;
  paymentId?: string;
};

async function setBotState(userId: string, mode: string, payload: CardRequestDraftPayload = {}, ttlMinutes = 30) {
  await getPool().query(
    `INSERT INTO telegram_bot_states(user_id, mode, payload, expires_at, updated_at)
     VALUES ($1::uuid,$2,$3::jsonb,now()+($4::int * interval '1 minute'),now())
     ON CONFLICT (user_id) DO UPDATE SET mode=EXCLUDED.mode,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at,updated_at=now()`,
    [userId, mode, JSON.stringify(payload), ttlMinutes],
  );
}

async function getBotState(userId: string) {
  const result = await getPool().query<{ mode: string; payload: CardRequestDraftPayload }>(
    `SELECT mode,payload FROM telegram_bot_states WHERE user_id=$1::uuid AND (expires_at IS NULL OR expires_at>now())`,
    [userId],
  );
  return result.rows[0] ?? null;
}

function dollarsToCents(input: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || value > 100000) return null;
  return Math.round(value * 100);
}

function validDob(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input && date.getTime() < Date.now();
}
function jalaliToGregorian(jy: number, jm: number, jd: number): { y: number; m: number; d: number } | null {
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const jy2 = jy + 1595;
  let days = -355668 + 365 * jy2 + Math.floor(jy2 / 33) * 8 + Math.floor(((jy2 % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthLengths = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let rem = gd;
  let gm = 0;
  for (gm = 0; gm < 13 && rem > monthLengths[gm]; gm++) rem -= monthLengths[gm];
  if (gm < 1 || gm > 12) return null;
  return { y: gy, m: gm, d: rem };
}
function parseDobToGregorian(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  if (y >= 1250 && y <= 1420) {
    const c = jalaliToGregorian(y, mo, d);
    if (!c) return null;
    return `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
  }
  return validDob(value) ? value : null;
}

function formatRialValue(value: string) {
  try { return `${BigInt(value).toLocaleString("en-US")} rial`; } catch { return `${escapeHtml(value)} rial`; }
}

async function beginCardRequest(client: TelegramClient, user: BotUser, chatId: number) {
  const policy = await getCardRequestPolicy();
  await setBotState(user.id, "card_request_amount", {}, 20);
  await client.sendMessage({
    chatId,
    text: render(BOT.requestCardStart, user.lang, { minimum: formatUsdCents(String(policy.minimumUsdCents)) }),
  });
}

async function handleCardRequestText(client: TelegramClient, user: BotUser, chatId: number, text: string) {
  const state = await getBotState(user.id);
  if (!state || !state.mode.startsWith("card_request_")) return false;
  const draft: CardRequestDraftPayload = { ...(state.payload ?? {}) };
  const value = text.trim();

  if (state.mode === "card_request_amount") {
    const cents = dollarsToCents(value);
    const policy = await getCardRequestPolicy();
    if (cents == null || cents < policy.minimumUsdCents) {
      await client.sendMessage({ chatId, text: render(BOT.cardAmountInvalid, user.lang, { minimum: formatUsdCents(String(policy.minimumUsdCents)) }) });
      return true;
    }
    draft.amountUsdCents = cents;
    await setBotState(user.id, "card_request_email", draft, 20);
    await client.sendMessage({ chatId, text: pick(BOT.askCardEmail, user.lang) });
    return true;
  }

  if (state.mode === "card_request_email") {
    const parsed = z.string().trim().email().max(320).safeParse(value);
    if (!parsed.success) {
      await client.sendMessage({ chatId, text: pick(BOT.invalidCardEmail, user.lang) });
      return true;
    }
    draft.email = parsed.data;
    await setBotState(user.id, "card_request_confirm", draft, 20);
    const submit = await createCallbackToken({ userId: user.id, action: "cardreq.submit", singleUse: true, ttlMinutes: 20 });
    const cancel = await createCallbackToken({ userId: user.id, action: "cardreq.cancel_draft", singleUse: true, ttlMinutes: 20 });
    await client.sendMessage({
      chatId,
      text: render(BOT.cardRequestReview, user.lang, { amount: formatUsdCents(String(draft.amountUsdCents)), email: escapeHtml(draft.email) }),
      replyMarkup: { inline_keyboard: [[{ text: pick(BOT.submit, user.lang), callback_data: submit }], [{ text: pick(BOT.cancel, user.lang), callback_data: cancel }]] },
    });
    return true;
  }

  if (state.mode === "card_request_confirm") {
    await client.sendMessage({ chatId, text: pick(BOT.useSubmit, user.lang) });
    return true;
  }
  if (state.mode === "card_request_receipt") {
    await client.sendMessage({ chatId, text: pick(BOT.receiptEvidenceRequired, user.lang) });
    return true;
  }
  return false;
}

async function sendCardRequestDetail(client: TelegramClient, user: BotUser, chatId: number, requestId: string) {
  const detail = await getTelegramCardRequest(user.id, requestId);
  const request = detail.request;
  const timeline = detail.events.map((event) =>
    `• ${escapeHtml(event.status)} · ${escapeHtml(new Date(event.createdAt).toISOString().replace("T", " ").slice(0, 16))} UTC${event.note ? ` · ${escapeHtml(event.note)}` : ""}`
  ).join("\n");
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  if (detail.payment?.receiptId) {
    rows.push([{ text: pick(BOT.viewReceipt, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "payment.receipt", entityId: detail.payment.id }) }]);
  }
  if (detail.payment && ["pending_receipt", "correction_needed"].includes(detail.payment.status)) {
    rows.push([{ text: pick(BOT.uploadPaymentReceiptButton, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.upload_receipt", entityId: request.id, ttlMinutes: 20 }) }]);
  }
  if (["pending_review", "correction_needed"].includes(request.status) && !["accepted", "completed"].includes(detail.payment?.status ?? "")) {
    rows.push([{ text: pick(BOT.cancelRequest, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.cancel_existing", entityId: request.id, singleUse: true, ttlMinutes: 10 }) }]);
  }
  rows.push([{ text: pick(BOT.backRequests, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "menu.requests" }) }]);
  const paymentText = detail.payment
    ? render(BOT.cardRequestPaymentDetail, user.lang, {
        status: escapeHtml(detail.payment.status),
        rate: escapeHtml(BigInt(detail.payment.rateRialPerUsd).toLocaleString("en-US")),
        rial: escapeHtml(formatRialValue(detail.payment.customerPaysRial)),
      })
    : "";
  const adminNote = request.adminNote ? render(BOT.adminNoteLine, user.lang, { note: escapeHtml(request.adminNote) }) : "";
  await client.sendMessage({
    chatId,
    text: render(BOT.cardRequestDetail, user.lang, {
      reference: escapeHtml(request.reference),
      type: escapeHtml(pick(BOT.newCardType, user.lang)),
      status: escapeHtml(request.status),
      amount: formatUsdCents(request.initialAmountUsdCents),
      email: escapeHtml(request.email),
      payment: paymentText,
      adminNote,
      timeline: timeline || escapeHtml(pick(BOT.noTimelineEvents, user.lang)),
    }),
    replyMarkup: { inline_keyboard: rows },
  });
}

async function handleCardRequestReceiptMedia(client: TelegramClient, user: BotUser, chatId: number, message: z.infer<typeof messageSchema>) {
  const state = await getBotState(user.id);
  if (!state || state.mode !== "card_request_receipt" || !state.payload?.paymentId || !state.payload?.cardRequestId) return false;
  const document = message.document;
  const photo = message.photo?.at(-1);
  const selected = document ?? photo;
  if (!selected) {
    await client.sendMessage({ chatId, text: pick(BOT.uploadReceiptFile, user.lang) });
    return true;
  }
  if (document?.mime_type && !["application/pdf","image/jpeg","image/png","image/webp"].includes(document.mime_type)) {
    await client.sendMessage({ chatId, text: pick(BOT.invalidReceiptType, user.lang) });
    return true;
  }
  await attachTelegramCustomerPaymentReceipt({
    userId: user.id,
    paymentId: state.payload.paymentId,
    telegramFileId: selected.file_id,
    telegramFileUniqueId: selected.file_unique_id,
    originalFilename: document?.file_name ?? `card-payment-${message.message_id}.jpg`,
    declaredMimeType: document?.mime_type ?? "image/jpeg",
  });
  await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
  await client.sendMessage({ chatId, text: pick(BOT.cardPaymentReceiptReceived, user.lang) });
  await sendCardRequestDetail(client, user, chatId, state.payload.cardRequestId);
  return true;
}

async function beginFundingRequest(client: TelegramClient, user: BotUser, chatId: number) {
  const cards = await userCards(user.id);
  if (!cards.length) {
    await sendPaymentInfo(client, user, chatId);
    return;
  }
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const card of cards) {
    const token = await createCallbackToken({ userId: user.id, action: "fundreq.card", entityId: card.id, ttlMinutes: 20 });
    rows.push([{ text: `${card.label || pick(BOT.defaultCardLabel, user.lang)} •${card.last4 ?? "????"}`, callback_data: token }]);
  }
  rows.push([{ text: pick(BOT.cancel, user.lang), callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text: pick(BOT.fundingChooseCard, user.lang), replyMarkup: { inline_keyboard: rows } });
}

async function sendFundingQuoteConfirmation(client: TelegramClient, user: BotUser, chatId: number, draft: CardRequestDraftPayload) {
  if (!draft.cardId || !draft.amountUsdCents) throw new ApiError(409, "draft_incomplete", "The funding request draft is incomplete.");
  const quote = await previewFundingQuote(user.id, draft.cardId, draft.amountUsdCents);
  draft.rateId = quote.rateId;
  draft.quoteRialPerUsd = quote.rialPerUsd;
  draft.quoteMinimumUsdCents = quote.minimumUsdCents;
  draft.quoteProviderFeeBasisPoints = quote.providerFeeBasisPoints;
  draft.quoteProviderFeeFixedUsdCents = quote.providerFeeFixedUsdCents;
  draft.quoteServiceFeeBasisPoints = quote.serviceFeeBasisPoints;
  draft.quoteExpiresAt = quote.expiresAt;
  await setBotState(user.id, "funding_request_confirm", draft, 20);
  const submit = await createCallbackToken({ userId: user.id, action: "fundreq.submit", singleUse: true, ttlMinutes: 20 });
  const cancel = await createCallbackToken({ userId: user.id, action: "fundreq.cancel_draft", singleUse: true, ttlMinutes: 20 });
  await client.sendMessage({
    chatId,
    text: render(BOT.fundingReviewQuote, user.lang, {
      last4: escapeHtml(quote.card.last4 ?? "????"),
      amount: formatUsdCents(quote.amountUsdCents),
      providerFee: formatUsdCents(quote.providerFeeUsdCents),
      serviceFee: formatUsdCents(quote.serviceFeeUsdCents),
      total: formatUsdCents(quote.clientPaysUsdCents),
      rate: escapeHtml(BigInt(quote.rialPerUsd).toLocaleString("en-US")),
      rial: escapeHtml(formatRialValue(quote.clientPaysRial)),
      expires: escapeHtml(new Date(quote.expiresAt).toISOString().replace("T", " ").slice(0,16)),
    }),
    replyMarkup: { inline_keyboard: [[{ text: pick(BOT.submitUploadReceipt, user.lang), callback_data: submit }], [{ text: pick(BOT.cancel, user.lang), callback_data: cancel }]] },
  });
}

async function handleFundingRequestText(client: TelegramClient, user: BotUser, chatId: number, text: string) {
  const state = await getBotState(user.id);
  if (!state || !state.mode.startsWith("funding_request_")) return false;
  const draft: CardRequestDraftPayload = { ...(state.payload ?? {}) };
  if (state.mode === "funding_request_amount") {
    const cents = dollarsToCents(text);
    const policy = await getFundingPolicy();
    if (cents == null || cents < policy.minimumUsdCents) {
      await client.sendMessage({ chatId, text: render(BOT.fundingAmountInvalid, user.lang, { minimum: formatUsdCents(String(policy.minimumUsdCents)) }) });
      return true;
    }
    draft.amountUsdCents = cents;
    await sendFundingQuoteConfirmation(client,user,chatId,draft);
    return true;
  }
  if (state.mode === "funding_request_confirm") {
    await client.sendMessage({ chatId, text: pick(BOT.useSubmitUpload, user.lang) });
    return true;
  }
  if (state.mode === "funding_request_receipt") {
    await client.sendMessage({ chatId, text: pick(BOT.fundingReceiptRequired, user.lang) });
    return true;
  }
  return false;
}

async function handleFundingReceiptMedia(client: TelegramClient, user: BotUser, chatId: number, message: z.infer<typeof messageSchema>) {
  const state = await getBotState(user.id);
  if (!state || state.mode !== "funding_request_receipt" || !state.payload?.fundingRequestId) return false;
  const document = message.document;
  const photo = message.photo?.at(-1);
  const selected = document ?? photo;
  if (!selected) {
    await client.sendMessage({ chatId, text: pick(BOT.uploadReceiptFile, user.lang) });
    return true;
  }
  if (document?.mime_type && !["application/pdf","image/jpeg","image/png","image/webp"].includes(document.mime_type)) {
    await client.sendMessage({ chatId, text: pick(BOT.invalidReceiptType, user.lang) });
    return true;
  }
  const attached = await attachTelegramReceipt({
    userId: user.id,
    requestId: state.payload.fundingRequestId,
    telegramFileId: selected.file_id,
    telegramFileUniqueId: selected.file_unique_id,
    originalFilename: document?.file_name ?? `telegram-receipt-${message.message_id}.jpg`,
    declaredMimeType: document?.mime_type ?? "image/jpeg",
  });
  await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`,[user.id]);
  await client.sendMessage({ chatId, text: `${render(BOT.receiptReceived, user.lang, { reference: escapeHtml(attached.request.reference) })}\n${pick(FLOW.waitPayment, user.lang)}` });
  return true;
}

async function sendFundingRequestDetail(client: TelegramClient, user: BotUser, chatId: number, requestId: string) {
  const [detail, payment] = await Promise.all([
    getTelegramFundingRequest(user.id,requestId),
    getPaymentForFundingRequest(requestId),
  ]);
  const request = detail.request;
  const timeline = detail.events.map((event)=>`• ${escapeHtml(event.status)} · ${escapeHtml(new Date(event.createdAt).toISOString().replace("T"," ").slice(0,16))} UTC${event.note?` · ${escapeHtml(event.note)}`:""}`).join("\n");
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  if (payment?.receiptId) rows.push([{ text: pick(BOT.viewReceipt, user.lang), callback_data: await createCallbackToken({userId:user.id,action:"payment.receipt",entityId:payment.id}) }]);
  if (["pending_receipt","correction_needed"].includes(request.status)) rows.push([{ text: pick(BOT.uploadReceipt, user.lang), callback_data: await createCallbackToken({userId:user.id,action:"fundreq.upload_receipt",entityId:request.id,ttlMinutes:20}) }]);
  if (["pending_receipt","pending_review","correction_needed"].includes(request.status)) rows.push([{ text: pick(BOT.cancelRequest, user.lang), callback_data: await createCallbackToken({userId:user.id,action:"fundreq.cancel_existing",entityId:request.id,singleUse:true,ttlMinutes:10}) }]);
  rows.push([{ text: pick(BOT.backRequests, user.lang), callback_data: await createCallbackToken({userId:user.id,action:"menu.requests"}) }]);
  const adminNote = request.adminNote ? render(BOT.adminNoteLine, user.lang, { note: escapeHtml(request.adminNote) }) : "";
  await client.sendMessage({
    chatId,
    text: render(BOT.fundingDetail, user.lang, {
      reference: escapeHtml(request.reference),
      status: escapeHtml(request.status),
      last4: escapeHtml(detail.card?.last4 ?? "????"),
      amount: formatUsdCents(request.cardAmountUsdCents),
      total: formatUsdCents(request.clientPaysUsdCents),
      rial: request.clientPaysRial ? escapeHtml(formatRialValue(request.clientPaysRial)) : escapeHtml(pick(BOT.unavailable, user.lang)),
      adminNote,
      receipt: detail.receipt?.scan_status ? escapeHtml(detail.receipt.scan_status) : escapeHtml(pick(BOT.notUploaded, user.lang)),
      timeline: timeline || escapeHtml(pick(BOT.noTimelineEvents, user.lang)),
    }),
    replyMarkup:{inline_keyboard:rows},
  });
}

async function beginSupport(client: TelegramClient, user: BotUser, chatId: number) {
  const env = parseServerEnv(process.env);
  await getPool().query(
    `INSERT INTO telegram_bot_states(user_id, mode, payload, expires_at, updated_at)
     VALUES ($1::uuid, 'support', '{}'::jsonb, now() + ($2::int * interval '1 minute'), now())
     ON CONFLICT (user_id) DO UPDATE SET mode='support', payload='{}'::jsonb, expires_at=EXCLUDED.expires_at, updated_at=now()`,
    [user.id, env.TELEGRAM_SUPPORT_MODE_MINUTES],
  );
  await client.sendMessage({ chatId, text: pick(BOT.supportPrompt, user.lang) });
}

async function supportMode(userId: string) {
  const result = await getPool().query<{ mode: string }>(
    `SELECT mode FROM telegram_bot_states WHERE user_id = $1::uuid AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );
  return result.rows[0]?.mode === "support";
}

async function storeSupportMessage(user: BotUser, message: z.infer<typeof messageSchema>, client: TelegramClient) {
  const conversation = await getPool().query<{ id: string }>(
    `INSERT INTO conversations(user_id, status, closed_at, updated_at)
     VALUES ($1::uuid, 'open', NULL, now())
     ON CONFLICT (user_id) DO UPDATE SET status='open', closed_at=NULL, updated_at=now()
     RETURNING id`,
    [user.id],
  );
  const conversationId = conversation.rows[0]!.id;
  const existing = await getPool().query<{ id: string }>(
    `SELECT m.id FROM messages m WHERE m.conversation_id=$1::uuid AND m.direction='client_to_admin' AND m.telegram_message_id=$2 LIMIT 1`,
    [conversationId, message.message_id],
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, duplicate: true, attachment: false };

  const text = (message.text ?? message.caption ?? "").trim().slice(0, 4000);
  const photo = message.photo?.length ? message.photo[message.photo.length - 1] : undefined;
  const document = message.document;
  let stored: Awaited<ReturnType<typeof storePrivateSupportAttachment>> | null = null;
  let telegramFileId: string | null = null;
  let telegramFileUniqueId: string | null = null;

  if (document || photo) {
    const env = parseServerEnv(process.env);
    const selected = document ?? photo!;
    if (selected.file_size && selected.file_size > env.SUPPORT_ATTACHMENT_MAX_BYTES) {
      throw new ApiError(413, "support_attachment_too_large", `Support attachments may be at most ${Math.floor(env.SUPPORT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB.`);
    }
    const file = await client.getFile(selected.file_id);
    if (!file.file_path) throw new ApiError(502, "telegram_file_missing_path", "Telegram did not provide a downloadable path for this attachment.");
    const bytes = await client.downloadFile(file.file_path, env.SUPPORT_ATTACHMENT_MAX_BYTES);
    stored = await storePrivateSupportAttachment({
      conversationId,
      bytes,
      originalFilename: document?.file_name ?? `telegram-photo-${message.message_id}.jpg`,
      declaredMimeType: document?.mime_type ?? "image/jpeg",
    });
    telegramFileId = selected.file_id;
    telegramFileUniqueId = selected.file_unique_id;
  }

  if (!text && !stored) throw new ApiError(400, "unsupported_support_message", "Send text, a PDF, or an image to support.");

  try {
    const inserted = await withTransaction(async (db) => {
      const row = await db.query<{ id: string }>(
        `INSERT INTO messages(conversation_id, direction, text_body, telegram_message_id, status, delivered_at)
         VALUES ($1::uuid, 'client_to_admin', NULLIF($2,''), $3, 'delivered', now())
         ON CONFLICT (conversation_id, telegram_message_id) WHERE direction='client_to_admin' AND telegram_message_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [conversationId, text, message.message_id],
      );
      if (!row.rows[0]) return null;
      const messageId = row.rows[0].id;
      if (stored) {
        await db.query(
          `INSERT INTO support_attachments(message_id, object_key, original_filename, declared_mime_type, detected_mime_type, size_bytes, sha256_hex, scan_status, scan_engine, scan_note, telegram_file_id, telegram_file_unique_id)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [messageId, stored.objectKey, stored.originalFilename, stored.declaredMimeType, stored.detectedMimeType, stored.sizeBytes, stored.sha256Hex, stored.scanStatus, stored.scanEngine, stored.scanNote, telegramFileId, telegramFileUniqueId],
        );
      }
      await db.query(
        `UPDATE conversations SET last_message_at=now(), updated_at=now(), status='open', closed_at=NULL,
                unread_admin_count=unread_admin_count+1, unread_client_count=0, last_client_ack_at=now()
          WHERE id=$1::uuid`,
        [conversationId],
      );
      await db.query(
        `INSERT INTO conversation_events(conversation_id,actor_type,actor_id,event_type,metadata_redacted)
         VALUES ($1::uuid,'telegram_user',$2::uuid,'message.received',$3::jsonb)`,
        [conversationId, user.id, JSON.stringify({ messageId, attachment: Boolean(stored) })],
      );
      return messageId;
    });
    if (!inserted) {
      if (stored) await deletePrivateSupportAttachment(stored.objectKey);
      const duplicate = await getPool().query<{ id: string }>(`SELECT m.id FROM messages m WHERE m.conversation_id=$1::uuid AND m.direction='client_to_admin' AND m.telegram_message_id=$2 LIMIT 1`, [conversationId, message.message_id]);
      return { id: duplicate.rows[0]?.id ?? "", duplicate: true, attachment: false };
    }
    return { id: inserted, duplicate: false, attachment: Boolean(stored) };
  } catch (error) {
    if (stored) await deletePrivateSupportAttachment(stored.objectKey).catch(() => {});
    throw error;
  }
}

async function handleCallback(client: TelegramClient, callback: z.infer<typeof callbackSchema>, user: BotUser, requestId: string) {
  const chatId = callback.message?.chat.id ?? Number(user.telegramUserId);
  const token = callback.data;
  if (!token) return;
  let resolved: CallbackRow;
  try {
    resolved = await resolveCallbackToken(token, user.id);
  } catch (error) {
    await client.answerCallbackQuery(callback.id, error instanceof ApiError ? error.message : "This button is unavailable.", true);
    return;
  }
  await client.answerCallbackQuery(callback.id);

  if (resolved.action === "membership.retry") {
    if (await assertBotAccess(client, user, chatId)) await sendMainMenu(client, user, chatId);
    return;
  }
  if (resolved.action === "menu.lang" || resolved.action === "lang.en" || resolved.action === "lang.fa") {
    if (resolved.action === "menu.lang") { await sendLangPicker(client, user, chatId); return; }
    const lang = resolved.action === "lang.fa" ? "fa" : "en";
    await setUserLang(user.id, lang);
    user.lang = lang;
    await client.sendMessage({ chatId, text: lang === "fa" ? COMMON.langSetFa.fa : COMMON.langSetEn.en });
    await routeHome(client, user, chatId);
    return;
  }
  if (resolved.action === "menu.home") { await routeHome(client, user, chatId); return; }
  if (resolved.action === "setup.status") { await sendSetupStatus(client, user, chatId); return; }
  if (resolved.action === "setup.kyc") { await sendKycInfo(client, user, chatId); return; }
  if (resolved.action === "setup.receipt") { await sendPaymentReceipt(client, user, chatId); return; }
  if (resolved.action === "support.start") {
    if (user.bannedAt) { await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) }); return; }
    await beginSupport(client, user, chatId);
    return;
  }
  if (resolved.action === "menu.paid") {
    if (user.bannedAt) { await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) }); return; }
    const ps = await getPaymentStatus(user.id);
    if (ps !== null && ps !== "denied") { await routeHome(client, user, chatId); return; }
    await auditTelegramEvent({ userId: user.id, action: "telegram.payment.amount_started", entityType: "telegram_user", entityId: user.id });
    await setKycState(user.id, "payment_amount", {}, 60);
    await client.sendMessage({ chatId, text: pick(PAYMENT.askAmount, user.lang) });
    return;
  }
  if (resolved.action === "menu.skipreceipt") {
    await client.sendMessage({ chatId, text: pick(PAYMENT.receiptRequired, user.lang) });
    return;
  }
  const gated =
    resolved.action === "menu.cards" || resolved.action === "menu.requests" ||
    resolved.action === "menu.add_funds" || resolved.action === "menu.request_card" ||
    resolved.action.startsWith("card.") || resolved.action.startsWith("cardreq.") ||
    resolved.action.startsWith("fundreq.") || resolved.action.startsWith("payment.");
  if (gated && (await getPaymentStatus(user.id)) !== "complete") { await routeHome(client, user, chatId); return; }
  if (resolved.action === "menu.kyc" || resolved.action === "kyc.submit" || resolved.action === "kyc.cancel") {
    if (user.bannedAt) {
      await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) });
      return;
    }
    try {
      if (resolved.action === "menu.kyc") await beginKyc(client, user, chatId);
      else if (resolved.action === "kyc.submit") await submitKyc(client, user, chatId);
      else await cancelKyc(client, user, chatId);
    } catch (error) {
    const message = error instanceof ApiError ? error.message : pick(BOT.actionFailed, user.lang);
      await client.sendMessage({ chatId, text: escapeHtml(message) });
      await auditTelegramEvent({ userId: user.id, action: "telegram.kyc.failed", entityType: "kyc_submission", requestId, metadata: { action: resolved.action, errorCode: error instanceof ApiError ? error.code : "internal_error" } });
    }
    return;
  }
  if (!(await assertBotAccess(client, user, chatId))) return;

  try {
  switch (resolved.action) {
      case "menu.home": await sendMainMenu(client, user, chatId); break;
      case "menu.payment": await sendPaymentInfo(client, user, chatId); break;
      case "menu.cards": await sendCards(client, user, chatId); break;
      case "card.detail": if (resolved.entity_id) await sendCardDetail(client, user, chatId, resolved.entity_id); break;
      case "card.reveal": if (resolved.entity_id) await sendFullCardInfo(client, user, chatId, resolved.entity_id, requestId); break;
      case "card.transactions": if (resolved.entity_id) await sendTransactions(client, user, chatId, resolved.entity_id); break;
      case "card.freeze":
      case "card.unfreeze": {
      if (!resolved.entity_id) break;
      if (!(await ownsCard(user.id, resolved.entity_id))) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
      const action = resolved.action === "card.freeze" ? "freeze" : "unfreeze";
      const result = await setKripicardCardFrozenStateForTelegram(resolved.entity_id, action, user.id, requestId);
      if (result.needsReconciliation) {
        await client.sendMessage({ chatId, text: pick(BOT.cardStateUncertain, user.lang) });
      } else {
        await client.sendMessage({ chatId, text: render(BOT.cardStateNow, user.lang, { status: escapeHtml(result.status) }) });
      }
      await sendCardDetail(client, user, chatId, resolved.entity_id);
      break;
    }
      case "menu.requests": await sendRequests(client, user, chatId); break;
      case "payment.detail": if (resolved.entity_id) await sendCustomerPaymentDetail(client, user, chatId, resolved.entity_id); break;
      case "payment.receipt": if (resolved.entity_id) await sendCustomerPaymentReceipt(client, user, chatId, resolved.entity_id); break;
      case "payment.upload": if (resolved.entity_id) await beginCustomerPaymentReceiptUpload(client, user, chatId, resolved.entity_id); break;
      case "menu.request_card": await beginCardRequest(client, user, chatId); break;
      case "cardreq.submit": {
        const state = await getBotState(user.id);
        if (!state || state.mode !== "card_request_confirm" || !state.payload.amountUsdCents || !state.payload.email) {
          throw new ApiError(409, "draft_expired", "This card request draft expired. Start again.");
        }
        const paymentCard = await getPaymentCard();
        if (!paymentCard.cardNumber) throw new ApiError(409, "payment_not_configured", "Payment instructions are not configured yet. Contact support.");
        const created = await createTelegramCardRequest(user.id, {
          amountUsdCents: state.payload.amountUsdCents,
          email: state.payload.email,
        });
        await setBotState(user.id, "card_request_receipt", { cardRequestId: created.request.id, paymentId: created.payment.id }, 60);
        const payText = user.lang === "fa"
          ? `درخواست <b>${escapeHtml(created.request.reference)}</b> ثبت شد.\nمبلغ: <b>${formatUsdCents(created.payment.customerPaysUsdCents)}</b>\nنرخ ثبت‌شده: ${escapeHtml(BigInt(created.payment.rateRialPerUsd).toLocaleString("en-US"))} ریال/دلار\nمبلغ دقیق قابل پرداخت: <b>${escapeHtml(formatRialValue(created.payment.customerPaysRial))}</b>\nکارت پرداخت: <code>${escapeHtml(paymentCard.cardNumber)}</code>\nبه نام: <b>${escapeHtml(paymentCard.cardHolder || "—")}</b>\n\nبعد از پرداخت، رسید را همینجا ارسال کنید. تا تایید مدیر هیچ کارتی ساخته نمی‌شود.`
          : `Card request <b>${escapeHtml(created.request.reference)}</b> was created.\nUSD basis: <b>${formatUsdCents(created.payment.customerPaysUsdCents)}</b>\nLocked rate: ${escapeHtml(BigInt(created.payment.rateRialPerUsd).toLocaleString("en-US"))} rial/USD\nPay exactly: <b>${escapeHtml(formatRialValue(created.payment.customerPaysRial))}</b>\nPayment card: <code>${escapeHtml(paymentCard.cardNumber)}</code>\nHolder: <b>${escapeHtml(paymentCard.cardHolder || "—")}</b>\n\nAfter paying, upload the receipt here. No card will be approved or issued before admin verification.`;
        await client.sendMessage({ chatId, text: payText });
        break;
      }
      case "cardreq.cancel_draft":
        await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
        await sendMainMenu(client, user, chatId);
        break;
      case "cardreq.detail": if (resolved.entity_id) await sendCardRequestDetail(client, user, chatId, resolved.entity_id); break;
      case "cardreq.upload_receipt": {
        if (!resolved.entity_id) break;
        const detail = await getTelegramCardRequest(user.id, resolved.entity_id);
        if (!detail.payment || !["pending_receipt","correction_needed"].includes(detail.payment.status)) {
          throw new ApiError(409, "invalid_state", "This card request is not waiting for payment evidence.");
        }
        await setBotState(user.id, "card_request_receipt", { cardRequestId: resolved.entity_id, paymentId: detail.payment.id }, 60);
        await client.sendMessage({ chatId, text: render(BOT.uploadPaymentEvidence, user.lang, { reference: escapeHtml(detail.request.reference) }) });
        break;
      }
      case "cardreq.cancel_existing": {
        if (!resolved.entity_id) break;
        await cancelTelegramCardRequest(user.id, resolved.entity_id);
        await client.sendMessage({ chatId, text: pick(BOT.cardRequestCancelled, user.lang) });
        await sendRequests(client, user, chatId);
        break;
      }
      case "menu.add_funds": await beginFundingRequest(client, user, chatId); break;
      case "fundreq.card": {
        if (!resolved.entity_id) break;
        const card = await ownsCard(user.id, resolved.entity_id);
        if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
        const policy = await getFundingPolicy();
        await setBotState(user.id, "funding_request_amount", { cardId: resolved.entity_id });
        await client.sendMessage({ chatId, text: render(BOT.fundingAmountPrompt, user.lang, { last4: escapeHtml(card.last4 ?? "????"), minimum: formatUsdCents(String(policy.minimumUsdCents)) }) });
        break;
      }
      case "fundreq.submit": {
        const state = await getBotState(user.id);
        if (!state || state.mode !== "funding_request_confirm") throw new ApiError(409, "draft_expired", "This funding quote expired. Start again.");
        const draft = state.payload;
        if (!draft.cardId || !draft.amountUsdCents || !draft.rateId || !draft.quoteRialPerUsd || !draft.quoteMinimumUsdCents || draft.quoteProviderFeeBasisPoints == null || !draft.quoteProviderFeeFixedUsdCents || draft.quoteServiceFeeBasisPoints == null || !draft.quoteExpiresAt) throw new ApiError(409, "draft_incomplete", "This funding request draft is incomplete. Start again.");
        if (new Date(draft.quoteExpiresAt).getTime() <= Date.now()) throw new ApiError(409, "quote_expired", "This funding quote expired. Start again to receive a current rate.");
        const created = await createTelegramFundingRequest({
          userId: user.id,
          cardId: draft.cardId,
          amountUsdCents: draft.amountUsdCents,
          quote: {
            rateId: draft.rateId,
            rialPerUsd: draft.quoteRialPerUsd,
            minimumUsdCents: draft.quoteMinimumUsdCents,
            providerFeeBasisPoints: draft.quoteProviderFeeBasisPoints,
            providerFeeFixedUsdCents: draft.quoteProviderFeeFixedUsdCents,
            serviceFeeBasisPoints: draft.quoteServiceFeeBasisPoints,
            expiresAt: draft.quoteExpiresAt,
          },
        });
        await setBotState(user.id, "funding_request_receipt", { fundingRequestId: created.id }, 60);
        await client.sendMessage({ chatId, text: `Funding request <b>${escapeHtml(created.reference)}</b> was created with an immutable quote.
Now upload your payment receipt as a JPEG, PNG, WebP, or PDF.

No card funding has been executed yet.` });
        break;
      }
      case "fundreq.cancel_draft":
        await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
        await client.sendMessage({ chatId, text: pick(BOT.fundingDraftCancelled, user.lang) });
        await sendMainMenu(client, user, chatId);
        break;
      case "fundreq.cancel_existing":
        if (resolved.entity_id) {
          const cancelled = await cancelTelegramFundingRequest(user.id, resolved.entity_id);
          await client.sendMessage({ chatId, text: render(BOT.fundingCancelled, user.lang, { reference: escapeHtml(cancelled.reference) }) });
          await sendRequests(client,user,chatId);
        }
        break;
      case "fundreq.upload_receipt":
        if (resolved.entity_id) {
          const detail = await getTelegramFundingRequest(user.id,resolved.entity_id);
          if (!["pending_receipt","correction_needed"].includes(detail.request.status)) throw new ApiError(409,"invalid_state","This request is not waiting for receipt evidence.");
          await setBotState(user.id,"funding_request_receipt",{fundingRequestId:resolved.entity_id},60);
          await client.sendMessage({ chatId, text: render(BOT.uploadReplacementEvidence, user.lang, { reference: escapeHtml(detail.request.reference) }) });
        }
        break;
      case "fundreq.detail": if (resolved.entity_id) await sendFundingRequestDetail(client,user,chatId,resolved.entity_id); break;
      case "support.start": await beginSupport(client, user, chatId); break;
      default: await client.sendMessage({ chatId, text: pick(BOT.actionExpired, user.lang) });
  }  } catch (error) {
    const message = error instanceof ApiError ? error.message : "This action could not be completed right now.";
    await client.sendMessage({ chatId, text: escapeHtml(message) });
    await auditTelegramEvent({ userId: user.id, action: "telegram.callback.failed", entityType: "telegram_callback", entityId: resolved.id, requestId, metadata: { action: resolved.action, errorCode: error instanceof ApiError ? error.code : "internal_error" } });
  }

}

type KycDraftPayload = {
  paymentId?: string;
  fullName?: string;
  dateOfBirth?: string | null;
  country?: string;
  nationalId?: string;
  phone?: string;
  deliveryCountry?: string;
  deliveryProvince?: string;
  deliveryCity?: string;
  deliveryAddressLine?: string;
  deliveryPostalCode?: string | null;
  document?: {
    objectKey: string;
    mimeType: string;
    filename: string | null;
    sizeBytes: number;
    sha256Hex: string;
  };
};

async function setKycState(userId: string, mode: string, payload: KycDraftPayload = {}, ttlMinutes = 30) {
  await getPool().query(
    `INSERT INTO telegram_bot_states(user_id, mode, payload, expires_at, updated_at)
     VALUES ($1::uuid,$2,$3::jsonb,now()+($4::int * interval '1 minute'),now())
     ON CONFLICT (user_id) DO UPDATE SET mode=EXCLUDED.mode,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at,updated_at=now()`,
    [userId, mode, JSON.stringify(payload), ttlMinutes],
  );
}

async function getKycState(userId: string): Promise<{ mode: string; payload: KycDraftPayload } | null> {
  const result = await getPool().query<{ mode: string; payload: KycDraftPayload }>(
    `SELECT mode,payload FROM telegram_bot_states WHERE user_id=$1::uuid AND (expires_at IS NULL OR expires_at>now())`,
    [userId],
  );
  const row = result.rows[0];
  return row ? { mode: row.mode, payload: (row.payload ?? {}) as KycDraftPayload } : null;
}

async function sendKycInvite(client: TelegramClient, user: BotUser, chatId: number) {
  const start = await createCallbackToken({ userId: user.id, action: "menu.kyc", ttlMinutes: 30 });
  const cancel = await createCallbackToken({ userId: user.id, action: "menu.home", ttlMinutes: 30 });
  await client.sendMessage({
    chatId,
    text: pick(KYC.invite, user.lang),
    replyMarkup: { inline_keyboard: [[{ text: pick(KYC.startKyc, user.lang), callback_data: start }], [{ text: pick(KYC.cancelBtn, user.lang), callback_data: cancel }]] },
  });
}

async function beginKyc(client: TelegramClient, user: BotUser, chatId: number) {
  const enabled = await settingValue("kyc_enabled", true);
  if (!enabled) { await client.sendMessage({ chatId, text: pick(KYC.featureDisabled, user.lang) }); return; }
  const status = await getKycStatusForUser(user.id);
  if (status === "approved") { await client.sendMessage({ chatId, text: pick(KYC.alreadyApproved, user.lang) }); return; }
  if (status === "pending") {
    await client.sendMessage({
      chatId,
      text: `${pick(KYC.alreadyPending, user.lang)}\n\n${pick(FLOW.waitingMenu, user.lang)}`,
      replyMarkup: await waitingKeyboard(user, false),
    });
    return;
  }
  await setKycState(user.id, "kyc_fullname", {}, 30);
  await client.sendMessage({ chatId, text: pick(KYC.intro, user.lang) });
}

async function handleKycText(client: TelegramClient, user: BotUser, chatId: number, text: string): Promise<boolean> {
  const state = await getKycState(user.id);
  if (!state || !state.mode.startsWith("kyc_")) return false;
  const draft: KycDraftPayload = { ...(state.payload ?? {}) };
  const value = text.trim();

  if (state.mode === "kyc_fullname") {
    if (value.length < 3 || value.length > 120) { await client.sendMessage({ chatId, text: pick(KYC.errFullName, user.lang) }); return true; }
    draft.fullName = value;
    await setKycState(user.id, "kyc_dob", draft);
    await client.sendMessage({ chatId, text: pick(KYC.askDob, user.lang) });
    return true;
  }
  if (state.mode === "kyc_dob") {
    const greg = parseDobToGregorian(value);
    if (!greg) { await client.sendMessage({ chatId, text: pick(KYC.errDob, user.lang) }); return true; }
    draft.dateOfBirth = greg;
    await setKycState(user.id, "kyc_country", draft);
    await client.sendMessage({ chatId, text: pick(KYC.askCountry, user.lang) });
    return true;
  }
  if (state.mode === "kyc_country") {
    if (value.length < 2 || value.length > 80) { await client.sendMessage({ chatId, text: pick(KYC.errCountry, user.lang) }); return true; }
    draft.country = value;
    await setKycState(user.id, "kyc_national_id", draft);
    await client.sendMessage({ chatId, text: pick(KYC.askNationalId, user.lang) });
    return true;
  }
  if (state.mode === "kyc_national_id") {
    if (value.length < 3 || value.length > 40) { await client.sendMessage({ chatId, text: pick(KYC.errNationalId, user.lang) }); return true; }
    draft.nationalId = value;
    await setKycState(user.id, "kyc_phone", draft);
    await client.sendMessage({ chatId, text: pick(KYC.askPhone, user.lang) });
    return true;
  }
  if (state.mode === "kyc_phone") {
    if (!/^\+?[0-9][0-9 ()-]{6,20}$/.test(value)) { await client.sendMessage({ chatId, text: pick(KYC.errPhone, user.lang) }); return true; }
    draft.phone = value;
    await setKycState(user.id, "kyc_delivery_country", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDeliveryCountry, user.lang) });
    return true;
  }
  if (state.mode === "kyc_delivery_country") {
    if (value.length < 2 || value.length > 80) { await client.sendMessage({ chatId, text: pick(KYC.errDeliveryCountry, user.lang) }); return true; }
    draft.deliveryCountry = value;
    await setKycState(user.id, "kyc_delivery_province", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDeliveryProvince, user.lang) });
    return true;
  }
  if (state.mode === "kyc_delivery_province") {
    if (value.length < 2 || value.length > 120) { await client.sendMessage({ chatId, text: pick(KYC.errDeliveryProvince, user.lang) }); return true; }
    draft.deliveryProvince = value;
    await setKycState(user.id, "kyc_delivery_city", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDeliveryCity, user.lang) });
    return true;
  }
  if (state.mode === "kyc_delivery_city") {
    if (value.length < 2 || value.length > 120) { await client.sendMessage({ chatId, text: pick(KYC.errDeliveryCity, user.lang) }); return true; }
    draft.deliveryCity = value;
    await setKycState(user.id, "kyc_delivery_address", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDeliveryAddress, user.lang) });
    return true;
  }
  if (state.mode === "kyc_delivery_address") {
    if (value.length < 8 || value.length > 300) { await client.sendMessage({ chatId, text: pick(KYC.errDeliveryAddress, user.lang) }); return true; }
    draft.deliveryAddressLine = value;
    await setKycState(user.id, "kyc_delivery_postal", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDeliveryPostal, user.lang) });
    return true;
  }
  if (state.mode === "kyc_delivery_postal") {
    if (value !== "-" && (value.length < 2 || value.length > 32)) { await client.sendMessage({ chatId, text: pick(KYC.errDeliveryPostal, user.lang) }); return true; }
    draft.deliveryPostalCode = value === "-" ? null : value;
    await setKycState(user.id, "kyc_document", draft, 30);
    await client.sendMessage({ chatId, text: pick(KYC.askDocument, user.lang) });
    return true;
  }
  if (state.mode === "kyc_document") {
    await client.sendMessage({ chatId, text: pick(KYC.askDocument, user.lang) });
    return true;
  }
  if (state.mode === "kyc_confirm") {
    await client.sendMessage({ chatId, text: pick(KYC.useButtons, user.lang) });
    return true;
  }
  return false;
}

async function handleKycMedia(client: TelegramClient, user: BotUser, chatId: number, message: z.infer<typeof messageSchema>): Promise<boolean> {
  const state = await getKycState(user.id);
  if (!state || state.mode !== "kyc_document") return false;
  const photo = message.photo?.at(-1);
  const document = message.document;
  const selected = document ?? photo;
  if (!selected) { await client.sendMessage({ chatId, text: pick(KYC.askDocument, user.lang) }); return true; }
  if (document?.mime_type && !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(document.mime_type)) {
    await client.sendMessage({ chatId, text: pick(KYC.errDocType, user.lang) });
    return true;
  }
  const env = parseServerEnv(process.env);
  if (selected.file_size && selected.file_size > env.SUPPORT_ATTACHMENT_MAX_BYTES) {
    await client.sendMessage({ chatId, text: pick(KYC.errDocSize, user.lang) });
    return true;
  }
  try {
    const file = await client.getFile(selected.file_id);
    if (!file.file_path) throw new ApiError(502, "telegram_file_missing_path", "Telegram did not provide a downloadable path for this file.");
    const bytes = await client.downloadFile(file.file_path, env.SUPPORT_ATTACHMENT_MAX_BYTES);
    const stored = await storePrivateSupportAttachment({
      conversationId: user.id,
      bytes,
      originalFilename: document?.file_name ?? `kyc-${message.message_id}.jpg`,
      declaredMimeType: document?.mime_type ?? "image/jpeg",
    });
    if (state.payload?.document?.objectKey && state.payload.document.objectKey !== stored.objectKey) {
      await deletePrivateSupportAttachment(state.payload.document.objectKey).catch(() => {});
    }
    const draft: KycDraftPayload = {
      ...(state.payload ?? {}),
      document: {
        objectKey: stored.objectKey,
        mimeType: stored.detectedMimeType,
        filename: stored.originalFilename,
        sizeBytes: stored.sizeBytes,
        sha256Hex: stored.sha256Hex,
      },
    };
    await sendKycConfirm(client, user, chatId, draft);
  } catch (error) {
    await client.sendMessage({ chatId, text: error instanceof ApiError ? escapeHtml(error.message) : pick(KYC.errDocGeneric, user.lang) });
  }
  return true;
}

async function sendKycConfirm(client: TelegramClient, user: BotUser, chatId: number, draft: KycDraftPayload) {
  if (!draft.fullName || !draft.country || !draft.nationalId || !draft.phone || !draft.deliveryCountry || !draft.deliveryProvince || !draft.deliveryCity || !draft.deliveryAddressLine || !draft.document) {
    throw new ApiError(409, "kyc_incomplete", "This KYC draft is incomplete. Send /kyc to start again.");
  }
  await setKycState(user.id, "kyc_confirm", draft, 20);
  const submit = await createCallbackToken({ userId: user.id, action: "kyc.submit", singleUse: true, ttlMinutes: 20 });
  const cancel = await createCallbackToken({ userId: user.id, action: "kyc.cancel", singleUse: true, ttlMinutes: 20 });
  const text = kycConfirmSummary({
    fullName: escapeHtml(draft.fullName),
    dateOfBirth: escapeHtml(draft.dateOfBirth ?? "—"),
    country: escapeHtml(draft.country),
    nationalId: escapeHtml(draft.nationalId),
    phone: escapeHtml(draft.phone),
    deliveryAddress: escapeHtml([
      draft.deliveryAddressLine,
      draft.deliveryCity,
      draft.deliveryProvince,
      draft.deliveryCountry,
      draft.deliveryPostalCode ? `Postal/ZIP ${draft.deliveryPostalCode}` : null,
    ].filter(Boolean).join(", ")),
  }, user.lang);
  await client.sendMessage({
    chatId,
    text,
    replyMarkup: { inline_keyboard: [[{ text: pick(BOT.kycSubmit, user.lang), callback_data: submit }], [{ text: pick(BOT.kycCancel, user.lang), callback_data: cancel }]] },
  });
}

async function submitKyc(client: TelegramClient, user: BotUser, chatId: number) {
  const state = await getKycState(user.id);
  if (!state || state.mode !== "kyc_confirm") throw new ApiError(409, "kyc_expired", "This KYC session expired. Send /kyc to start again.");
  const draft = state.payload;
  if (!draft.fullName || !draft.country || !draft.nationalId || !draft.phone || !draft.deliveryCountry || !draft.deliveryProvince || !draft.deliveryCity || !draft.deliveryAddressLine) {
    throw new ApiError(409, "kyc_incomplete", "This KYC draft is incomplete. Send /kyc to start again.");
  }
  const created = await createKycSubmission({
    telegramUserId: user.id,
    fullName: draft.fullName,
    dateOfBirth: draft.dateOfBirth ?? null,
    country: draft.country,
    nationalId: draft.nationalId,
    phone: draft.phone,
    deliveryCountry: draft.deliveryCountry,
    deliveryProvince: draft.deliveryProvince,
    deliveryCity: draft.deliveryCity,
    deliveryAddressLine: draft.deliveryAddressLine,
    deliveryPostalCode: draft.deliveryPostalCode ?? null,
    document: draft.document ?? null,
  });
  await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
  await auditTelegramEvent({ userId: user.id, action: "telegram.kyc.submitted", entityType: "kyc_submission", entityId: created.id });
  await client.sendMessage({ chatId, text: pick(KYC.submitted, user.lang) });
}

async function cancelKyc(client: TelegramClient, user: BotUser, chatId: number) {
  const state = await getKycState(user.id);
  if (state?.payload?.document?.objectKey) {
    await deletePrivateSupportAttachment(state.payload.document.objectKey).catch(() => {});
  }
  await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
  await client.sendMessage({ chatId, text: pick(KYC.cancelled, user.lang) });
  if (await assertBotAccess(client, user, chatId)) await sendMainMenu(client, user, chatId);
}

async function handleMessage(client: TelegramClient, message: z.infer<typeof messageSchema>, user: BotUser) {
  const chatId = message.chat.id;
  if (message.chat.type !== "private") return;
  const text = message.text?.trim() ?? "";

  if (user.bannedAt) {
    await client.sendMessage({ chatId, text: pick(KYC.accessDisabled, user.lang) });
    return;
  }
  const activeFlowState = await getBotState(user.id);
  const isSensitiveKycFlow = Boolean(activeFlowState?.mode.startsWith("kyc_"));
  if ((text || message.photo || message.document) && !(await supportMode(user.id)) && !isSensitiveKycFlow) {
    await logChatMessage(user, "client_to_admin", text || (message.photo ? "[photo]" : "[document]")).catch(() => {});
  }

  if (text === "/cancel") {
    const state = await getBotState(user.id);
    if (state?.mode === "funding_request_receipt" && state.payload?.fundingRequestId) {
      await cancelTelegramFundingRequest(user.id, state.payload.fundingRequestId).catch(() => {});
    }
    const kycState = await getKycState(user.id);
    if (kycState?.payload?.document?.objectKey) {
      await deletePrivateSupportAttachment(kycState.payload.document.objectKey).catch(() => {});
    }
    await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id = $1::uuid`, [user.id]);
    if (await assertBotAccess(client, user, chatId)) await sendMainMenu(client, user, chatId);
    else await routeHome(client, user, chatId);
    return;
  }
  if (text && (await handlePaymentAmountText(client, user, chatId, text))) return;
  if (await handlePaymentReceiptMedia(client, user, chatId, message)) return;
  if (await handleKycMedia(client, user, chatId, message)) return;
  if (text && (await handleKycText(client, user, chatId, text))) return;
  if (text === "/kyc") { await beginKyc(client, user, chatId); return; }
  if (text === "/support") { await beginSupport(client, user, chatId); return; }

  if (text === "/lang") { await sendLangPicker(client, user, chatId); return; }
  if (text === "/help") {
    await client.sendMessage({
      chatId,
      text: pick(BOT.help, user.lang),
    });
    return;
  }
  if (text === "/start" || text === "/menu") {
    await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid AND mode='support'`, [user.id]);
    await routeHome(client, user, chatId);
    return;
  }

  if (await supportMode(user.id)) {
    try {
      const stored = await storeSupportMessage(user, message, client);
      await client.sendMessage({ chatId, text: stored.duplicate ? "Support already received this message." : `Your message${stored.attachment ? " and attachment" : ""} was sent to support. Send another message, or /cancel to return to the menu.` });
    } catch (error) {
      await client.sendMessage({ chatId, text: error instanceof ApiError ? escapeHtml(error.message) : pick(BOT.supportFailed, user.lang) });
    }
    return;
  }

  if (!(await assertBotAccess(client, user, chatId))) return;
  if (await handleCardRequestReceiptMedia(client,user,chatId,message)) return;
  if (text && await handleCardRequestText(client,user,chatId,text)) return;
  if (await handleFundingReceiptMedia(client,user,chatId,message)) return;
  if (text && await handleFundingRequestText(client,user,chatId,text)) return;
  await sendMainMenu(client, user, chatId);
}

export async function processTelegramUpdate(updateInput: unknown, payloadHash: string, requestId: string) {
  const update = telegramUpdateSchema.parse(updateInput);
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO webhook_events(source, external_id, payload_hash, status)
     VALUES ('telegram', $1, $2, 'processing')
     ON CONFLICT (source, external_id) DO UPDATE SET
       status='processing', processed_at=NULL, received_at=now()
       WHERE webhook_events.payload_hash=EXCLUDED.payload_hash
         AND (webhook_events.status='failed'
              OR (webhook_events.status='processing' AND webhook_events.received_at < now() - interval '2 minutes'))
     RETURNING id`,
    [String(update.update_id), payloadHash],
  );
  if (!inserted.rows[0]) return { ok: true, duplicate: true };

  try {
    const actor = update.callback_query?.from ?? update.message?.from;
    if (!actor || actor.is_bot) {
      await getPool().query(`UPDATE webhook_events SET status='ignored', processed_at=now() WHERE source='telegram' AND external_id=$1`, [String(update.update_id)]);
      return { ok: true, ignored: true };
    }
    const user = await upsertTelegramUser(actor);
    await refreshBotTextRuntime();
    const client = withChatLog(await getTelegramClient(), user);
    await getPool().query(`UPDATE conversations SET unread_client_count=0, last_client_ack_at=now(), updated_at=now() WHERE user_id=$1::uuid AND unread_client_count > 0`, [user.id]);
    if (update.callback_query) await handleCallback(client, update.callback_query, user, requestId);
    else if (update.message) await handleMessage(client, update.message, user);
    await getPool().query(`UPDATE webhook_events SET status='processed', processed_at=now(), result_ref=$2 WHERE source='telegram' AND external_id=$1`, [String(update.update_id), user.id]);
    await auditTelegramEvent({ userId: user.id, action: "telegram.update.processed", entityType: "telegram_update", entityId: String(update.update_id), requestId, metadata: { kind: update.callback_query ? "callback_query" : "message" } });
    return { ok: true, duplicate: false };
  } catch (error) {
    await getPool().query(`UPDATE webhook_events SET status='failed', processed_at=now() WHERE source='telegram' AND external_id=$1`, [String(update.update_id)]).catch(() => {});
    throw error;
  }
}
