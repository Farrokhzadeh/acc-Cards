import { z } from "zod";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { randomToken, sha256Hex } from "@/server/security/crypto";
import { TelegramClient, type TelegramInlineKeyboard } from "@/server/providers/telegram/client";
import { listStoredCardTransactions, setKripicardCardFrozenStateForTelegram } from "@/server/providers/kripicard/service";
import { cancelTelegramCardRequest, createTelegramCardRequest, getCardRequestBins, getCardRequestPolicy, getTelegramCardRequest, getTelegramCardRequestCapacity } from "@/server/card-requests/service";
import { cancelTelegramFundingRequest, createTelegramFundingRequest, getFundingPolicy, getTelegramFundingRequest, previewFundingQuote } from "@/server/funding/service";
import { attachTelegramReceipt } from "@/server/funding/receipts";
import { deletePrivateSupportAttachment, storePrivateSupportAttachment } from "@/server/support/storage";
import { createKycSubmission, getKycStatusForUser } from "@/server/kyc/service";
import { KYC, kycConfirmSummary, pick, MENU, COMMON } from "@/server/kyc/messages";
import { getTelegramClient } from "@/server/telegram/credentials";

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

async function accountCount(userId: string) {
  const result = await getPool().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM telegram_account_assignments WHERE telegram_user_id = $1::uuid`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
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
      // Misconfigured channels must not silently lock every user out. Fail open and surface diagnostics to admins via audit.
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
    if (url) rows.push([{ text: `Join ${channel.title}`, url }]);
  }
  const retry = await createCallbackToken({ userId: user.id, action: "membership.retry" });
  rows.push([{ text: "✅ I've joined — check again", callback_data: retry }]);
  await client.sendMessage({ chatId, text: "To use AccAbad, join the required channel(s) below and then check again.", replyMarkup: { inline_keyboard: rows } });
}

async function sendNoAssignment(client: TelegramClient, chatId: number) {
  const text = await settingValue("contact_admin_text", "Please contact an administrator to activate your account.");
  await client.sendMessage({ chatId, text: escapeHtml(String(text)) });
}

async function mainKeyboard(userId: string, lang: string | null): Promise<TelegramInlineKeyboard> {
  const L = (msg: { en: string; fa: string }) => pick(msg, lang);
  const pairs = await Promise.all([
    [L(MENU.cards), "menu.cards"],
    [L(MENU.requests), "menu.requests"],
    [L(MENU.addFunds), "menu.add_funds"],
    [L(MENU.requestCard), "menu.request_card"],
    [L(MENU.verify), "menu.kyc"],
    [L(MENU.support), "support.start"],
    [L(MENU.language), "menu.lang"],
  ].map(async ([text, action]) => ({ text, callback_data: await createCallbackToken({ userId, action }) })));
  return { inline_keyboard: [[pairs[0], pairs[1]], [pairs[2], pairs[3]], [pairs[4], pairs[5]], [pairs[6]]] };
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

// Route a user "home" (/start, /menu, or right after choosing a language) with
// messaging that reflects their real KYC / account state instead of a generic error.
async function routeHome(client: TelegramClient, user: BotUser, chatId: number) {
  if (user.lang === null) { await sendLangPicker(client, user, chatId); return; }
  const st = await getKycStatusForUser(user.id);
  if (st === "none" || st === "rejected") { await sendKycInvite(client, user, chatId); return; }
  if (st === "pending") { await client.sendMessage({ chatId, text: pick(KYC.alreadyPending, user.lang) }); return; }
  if (await assertBotAccess(client, user, chatId)) await sendMainMenu(client, user, chatId);
  else await client.sendMessage({ chatId, text: pick(KYC.approvedNoAccount, user.lang) });
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
    await client.sendMessage({ chatId, text: "Your AccAbad access is currently disabled. Contact an administrator." });
    return false;
  }
  const membership = await checkMembership(client, user);
  if (membership.missing.length) {
    await sendJoinGate(client, user, chatId, membership.missing);
    return false;
  }
  if ((await accountCount(user.id)) === 0) {
    await sendNoAssignment(client, chatId);
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
    await client.sendMessage({ chatId, text: "No cards are currently available on your assigned account(s).", replyMarkup: { inline_keyboard: [[{ text: "← Main menu", callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]] } });
    return;
  }
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const card of cards) {
    const token = await createCallbackToken({ userId: user.id, action: "card.detail", entityId: card.id });
    rows.push([{ text: `${card.status === "frozen" ? "❄️" : "💳"} ${card.label || "Card"} •${card.last4 ?? "????"}`, callback_data: token }]);
  }
  rows.push([{ text: "← Main menu", callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text: "<b>Your cards</b>\nCards are resolved from your current account assignments.", replyMarkup: { inline_keyboard: rows } });
}

async function sendCardDetail(client: TelegramClient, user: BotUser, chatId: number, cardId: string) {
  const card = await ownsCard(user.id, cardId);
  if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to your account.");
  const txToken = await createCallbackToken({ userId: user.id, action: "card.transactions", entityId: card.id });
  const stateAction = card.status === "frozen" ? "card.unfreeze" : "card.freeze";
  const stateToken = await createCallbackToken({ userId: user.id, action: stateAction, entityId: card.id, singleUse: true, ttlMinutes: 10 });
  const back = await createCallbackToken({ userId: user.id, action: "menu.cards" });
  const stateLabel = card.status === "frozen" ? "🔓 Unfreeze" : "❄️ Freeze";
  await client.sendMessage({
    chatId,
    text: `<b>${escapeHtml(card.label || "Card")}</b>\nCard: •${escapeHtml(card.last4 ?? "????")}\nStatus: <b>${escapeHtml(card.status)}</b>\nBalance: <b>${formatUsdCents(card.balance_usd_cents)}</b>`,
    replyMarkup: { inline_keyboard: [[{ text: "Transactions", callback_data: txToken }, { text: stateLabel, callback_data: stateToken }], [{ text: "← Cards", callback_data: back }]] },
  });
}

async function sendTransactions(client: TelegramClient, user: BotUser, chatId: number, cardId: string) {
  const card = await ownsCard(user.id, cardId);
  if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to your account.");
  const items = await listStoredCardTransactions(cardId, 10);
  const lines = items.length ? items.map((tx) => {
    const amount = `${Number(BigInt(tx.amountMinor)) / 100} ${escapeHtml(tx.currency)}`;
    const merchant = escapeHtml(tx.merchant || tx.type || "Transaction");
    return `• ${merchant} — ${amount} — ${escapeHtml(tx.status)}`;
  }).join("\n") : "No synchronized transactions are stored for this card yet.";
  const back = await createCallbackToken({ userId: user.id, action: "card.detail", entityId: cardId });
  await client.sendMessage({ chatId, text: `<b>Recent transactions · •${escapeHtml(card.last4 ?? "????")}</b>\n${lines}`, replyMarkup: { inline_keyboard: [[{ text: "← Card", callback_data: back }]] } });
}

async function sendRequests(client: TelegramClient, user: BotUser, chatId: number) {
  const cardRequests = await getPool().query<{ id: string; reference: string; status: string; created_at: Date }>(
    `SELECT id,reference,status,created_at FROM card_requests WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 8`,
    [user.id],
  );
  const funding = await getPool().query<{ id: string; reference: string; status: string; submitted_at: Date }>(
    `SELECT id,reference,status,submitted_at FROM funding_requests WHERE user_id=$1::uuid ORDER BY submitted_at DESC LIMIT 6`,
    [user.id],
  );
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const request of cardRequests.rows) {
    rows.push([{ text: `${request.reference} · ${request.status}`, callback_data: await createCallbackToken({ userId: user.id, action: "request.detail", entityId: request.id }) }]);
  }
  for (const request of funding.rows) {
    rows.push([{ text: `${request.reference} · ${request.status}`, callback_data: await createCallbackToken({ userId: user.id, action: "fundreq.detail", entityId: request.id }) }]);
  }
  const text = cardRequests.rows.length || funding.rows.length
    ? `<b>My requests</b>\nTap a request below to see its current status and timeline.`
    : "<b>My requests</b>\nYou do not have any requests yet.";
  rows.push([{ text: "← Main menu", callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text, replyMarkup: { inline_keyboard: rows } });
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

async function beginCardRequest(client: TelegramClient, user: BotUser, chatId: number) {
  const capacity = await getTelegramCardRequestCapacity(user.id);
  if (capacity.assigned_accounts < 1) {
    await client.sendMessage({ chatId, text: "You need an assigned Kripicard account before requesting a card." });
    return;
  }
  if (capacity.usedSlots >= capacity.platformLimit) {
    await client.sendMessage({ chatId, text: `You currently use all <b>${capacity.platformLimit}</b> card slots, including open card requests. Close or cancel an open request before creating another.` });
    return;
  }
  const bins = await getCardRequestBins();
  if (!bins.length) throw new ApiError(503, "card_request_bins_unavailable", "Card requests are temporarily unavailable because no verified BINs are configured.");
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const item of bins) {
    rows.push([{
      text: `${item.bin}${item.requiresDob ? " · DOB required" : ""}`,
      callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.bin", payload: { bin: item.bin }, singleUse: true, ttlMinutes: 15 }),
    }]);
  }
  rows.push([{ text: "Cancel", callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.cancel_draft", singleUse: true, ttlMinutes: 15 }) }]);
  await setBotState(user.id, "idle", {});
  await client.sendMessage({
    chatId,
    text: `<b>Request a new card</b>\nChoose a BIN. Your platform limit is ${capacity.platformLimit} cards across all assigned accounts, including open requests.`,
    replyMarkup: { inline_keyboard: rows },
  });
}

async function sendCardRequestConfirmation(client: TelegramClient, user: BotUser, chatId: number, draft: CardRequestDraftPayload) {
  if (!draft.bin || !draft.amountUsdCents || !draft.nameOnCard || !draft.email) throw new ApiError(409, "draft_incomplete", "This card request draft is incomplete. Start again.");
  const submit = await createCallbackToken({ userId: user.id, action: "cardreq.submit", singleUse: true, ttlMinutes: 15 });
  const cancel = await createCallbackToken({ userId: user.id, action: "cardreq.cancel_draft", singleUse: true, ttlMinutes: 15 });
  await setBotState(user.id, "card_request_confirm", draft, 20);
  await client.sendMessage({
    chatId,
    text: `<b>Confirm card request</b>\nBIN: <code>${escapeHtml(draft.bin)}</code>\nInitial amount: <b>${formatUsdCents(String(draft.amountUsdCents))}</b>\nName: ${escapeHtml(draft.nameOnCard)}\nEmail: ${escapeHtml(draft.email)}${draft.dateOfBirth ? `\nDOB: ${escapeHtml(draft.dateOfBirth)}` : ""}\n\nSubmitting creates a request for admin review. It does not create a Kripicard card or move funds.`,
    replyMarkup: { inline_keyboard: [[{ text: "Submit request", callback_data: submit }], [{ text: "Cancel", callback_data: cancel }]] },
  });
}

async function sendCardRequestDetail(client: TelegramClient, user: BotUser, chatId: number, requestId: string) {
  const detail = await getTelegramCardRequest(user.id, requestId);
  const request = detail.request;
  const timeline = detail.events.map((event) => `• ${escapeHtml(event.status)} · ${escapeHtml(new Date(event.createdAt).toISOString().replace("T", " ").slice(0, 16))} UTC${event.note ? ` · ${escapeHtml(event.note)}` : ""}`).join("\n");
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  if (["pending_review", "correction_needed"].includes(request.status)) {
    rows.push([{ text: "Cancel request", callback_data: await createCallbackToken({ userId: user.id, action: "cardreq.cancel_existing", entityId: request.id, singleUse: true, ttlMinutes: 10 }) }]);
  }
  rows.push([{ text: "← My requests", callback_data: await createCallbackToken({ userId: user.id, action: "menu.requests" }) }]);
  await client.sendMessage({
    chatId,
    text: `<b>${escapeHtml(request.reference)}</b>\nStatus: <b>${escapeHtml(request.status)}</b>\nBIN: <code>${escapeHtml(request.bin)}</code>\nInitial amount: <b>${formatUsdCents(request.initialAmountUsdCents)}</b>\nName: ${escapeHtml(request.nameOnCard)}\nEmail: ${escapeHtml(request.email)}${request.dateOfBirth ? `\nDOB: ${escapeHtml(request.dateOfBirth)}` : ""}${request.adminNote ? `\nAdmin note: ${escapeHtml(request.adminNote)}` : ""}\n\n<b>Timeline</b>\n${timeline || "No timeline events."}`,
    replyMarkup: { inline_keyboard: rows },
  });
}

async function handleCardRequestText(client: TelegramClient, user: BotUser, chatId: number, text: string) {
  const state = await getBotState(user.id);
  if (!state || !state.mode.startsWith("card_request_")) return false;
  const draft: CardRequestDraftPayload = { ...(state.payload ?? {}) };
  const policy = await getCardRequestPolicy();

  if (state.mode === "card_request_amount") {
    const cents = dollarsToCents(text);
    if (cents == null) {
      await client.sendMessage({ chatId, text: "Enter the initial amount in USD, for example <code>20</code> or <code>25.50</code>. Send /cancel to stop." });
      return true;
    }
    if (cents < policy.minimumUsdCents) {
      await client.sendMessage({ chatId, text: `The minimum initial card amount is <b>${formatUsdCents(String(policy.minimumUsdCents))}</b>. Enter a higher amount.` });
      return true;
    }
    draft.amountUsdCents = cents;
    await setBotState(user.id, "card_request_name", draft);
    await client.sendMessage({ chatId, text: "Enter the cardholder name exactly as it should appear on the card (minimum 2 characters)." });
    return true;
  }

  if (state.mode === "card_request_name") {
    if (text.length < 2 || text.length > 100) {
      await client.sendMessage({ chatId, text: "Cardholder name must be between 2 and 100 characters." });
      return true;
    }
    draft.nameOnCard = text;
    await setBotState(user.id, "card_request_email", draft);
    await client.sendMessage({ chatId, text: "Enter the cardholder email address." });
    return true;
  }

  if (state.mode === "card_request_email") {
    const parsed = z.string().email().max(320).safeParse(text);
    if (!parsed.success) {
      await client.sendMessage({ chatId, text: "Enter a valid email address, for example <code>name@example.com</code>." });
      return true;
    }
    draft.email = parsed.data;
    const bins = await getCardRequestBins();
    const requiresDob = bins.find((item) => item.bin === draft.bin)?.requiresDob ?? false;
    if (requiresDob) {
      await setBotState(user.id, "card_request_dob", draft);
      await client.sendMessage({ chatId, text: "This BIN requires date of birth. Enter it as <code>YYYY-MM-DD</code>." });
    } else {
      draft.dateOfBirth = null;
      await sendCardRequestConfirmation(client, user, chatId, draft);
    }
    return true;
  }

  if (state.mode === "card_request_dob") {
    if (!validDob(text)) {
      await client.sendMessage({ chatId, text: "Enter a valid past date in <code>YYYY-MM-DD</code> format." });
      return true;
    }
    draft.dateOfBirth = text;
    await sendCardRequestConfirmation(client, user, chatId, draft);
    return true;
  }

  if (state.mode === "card_request_confirm") {
    await client.sendMessage({ chatId, text: "Use the Submit request or Cancel button above, or send /cancel." });
    return true;
  }
  return false;
}


function formatRialValue(value: string) {
  try { return `${BigInt(value).toLocaleString("en-US")} rial`; } catch { return `${escapeHtml(value)} rial`; }
}

async function beginFundingRequest(client: TelegramClient, user: BotUser, chatId: number) {
  const cards = await userCards(user.id);
  if (!cards.length) {
    await client.sendMessage({ chatId, text: "You do not currently have an assigned card that can receive a funding request." });
    return;
  }
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  for (const card of cards) {
    const token = await createCallbackToken({ userId: user.id, action: "fundreq.card", entityId: card.id, ttlMinutes: 20 });
    rows.push([{ text: `${card.label || "Card"} •${card.last4 ?? "????"}`, callback_data: token }]);
  }
  rows.push([{ text: "Cancel", callback_data: await createCallbackToken({ userId: user.id, action: "menu.home" }) }]);
  await client.sendMessage({ chatId, text: "<b>Funding request</b>\nChoose the card you want to fund.", replyMarkup: { inline_keyboard: rows } });
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
    text: `<b>Review funding quote</b>\nCard: •${escapeHtml(quote.card.last4 ?? "????")}\nCard amount: <b>${formatUsdCents(quote.amountUsdCents)}</b>\nProvider fee: ${formatUsdCents(quote.providerFeeUsdCents)}\nService fee: ${formatUsdCents(quote.serviceFeeUsdCents)}\nTotal USD basis: <b>${formatUsdCents(quote.clientPaysUsdCents)}</b>\nRate: ${escapeHtml(BigInt(quote.rialPerUsd).toLocaleString("en-US"))} rial/USD\nClient pays: <b>${escapeHtml(formatRialValue(quote.clientPaysRial))}</b>\n\nThis quote expires at ${escapeHtml(new Date(quote.expiresAt).toISOString().replace("T", " ").slice(0,16))} UTC.`,
    replyMarkup: { inline_keyboard: [[{ text: "Submit & upload receipt", callback_data: submit }], [{ text: "Cancel", callback_data: cancel }]] },
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
      await client.sendMessage({ chatId, text: `Enter a valid USD amount of at least <b>${formatUsdCents(String(policy.minimumUsdCents))}</b>, for example <code>50</code> or <code>75.25</code>.` });
      return true;
    }
    draft.amountUsdCents = cents;
    await sendFundingQuoteConfirmation(client,user,chatId,draft);
    return true;
  }
  if (state.mode === "funding_request_confirm") {
    await client.sendMessage({ chatId, text: "Use the Submit & upload receipt button above, or send /cancel." });
    return true;
  }
  if (state.mode === "funding_request_receipt") {
    await client.sendMessage({ chatId, text: "Upload the receipt as a JPEG, PNG, WebP, or PDF file. Text alone cannot be used as payment evidence. Send /cancel to cancel the request." });
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
    await client.sendMessage({ chatId, text: "Upload a JPEG, PNG, WebP, or PDF receipt file." });
    return true;
  }
  if (document?.mime_type && !["application/pdf","image/jpeg","image/png","image/webp"].includes(document.mime_type)) {
    await client.sendMessage({ chatId, text: "That document type is not accepted. Upload a PDF, JPEG, PNG, or WebP receipt." });
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
  await client.sendMessage({ chatId, text: `Receipt received for <b>${escapeHtml(attached.request.reference)}</b>. The request is now awaiting admin review. No card funding has been executed.` });
  return true;
}

async function sendFundingRequestDetail(client: TelegramClient, user: BotUser, chatId: number, requestId: string) {
  const detail = await getTelegramFundingRequest(user.id,requestId);
  const request = detail.request;
  const timeline = detail.events.map((event)=>`• ${escapeHtml(event.status)} · ${escapeHtml(new Date(event.createdAt).toISOString().replace("T"," ").slice(0,16))} UTC${event.note?` · ${escapeHtml(event.note)}`:""}`).join("\n");
  const rows: TelegramInlineKeyboard["inline_keyboard"] = [];
  if (["pending_receipt","correction_needed"].includes(request.status)) rows.push([{text:"Upload receipt",callback_data:await createCallbackToken({userId:user.id,action:"fundreq.upload_receipt",entityId:request.id,ttlMinutes:20})}]);
  if (["pending_receipt","pending_review","correction_needed"].includes(request.status)) rows.push([{text:"Cancel request",callback_data:await createCallbackToken({userId:user.id,action:"fundreq.cancel_existing",entityId:request.id,singleUse:true,ttlMinutes:10})}]);
  rows.push([{text:"← My requests",callback_data:await createCallbackToken({userId:user.id,action:"menu.requests"})}]);
  await client.sendMessage({
    chatId,
    text:`<b>${escapeHtml(request.reference)}</b>\nStatus: <b>${escapeHtml(request.status)}</b>\nCard: •${escapeHtml(detail.card?.last4??"????")}\nCard amount: <b>${formatUsdCents(request.cardAmountUsdCents)}</b>\nTotal USD basis: ${formatUsdCents(request.clientPaysUsdCents)}\nClient pays: ${request.clientPaysRial?escapeHtml(formatRialValue(request.clientPaysRial)):"Unavailable"}${request.adminNote?`\nAdmin note: ${escapeHtml(request.adminNote)}`:""}\nReceipt: ${detail.receipt?.scan_status?escapeHtml(detail.receipt.scan_status):"not uploaded"}\n\n<b>Timeline</b>\n${timeline||"No timeline events."}`,
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
  await client.sendMessage({ chatId, text: "Send your support message now. It will appear in AccAbad Admin. Send /cancel when you're finished." });
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
  // KYC callbacks run before the account/membership gate so new customers can verify first.
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
      const message = error instanceof ApiError ? error.message : "This action could not be completed right now.";
      await client.sendMessage({ chatId, text: escapeHtml(message) });
      await auditTelegramEvent({ userId: user.id, action: "telegram.kyc.failed", entityType: "kyc_submission", requestId, metadata: { action: resolved.action, errorCode: error instanceof ApiError ? error.code : "internal_error" } });
    }
    return;
  }
  if (!(await assertBotAccess(client, user, chatId))) return;

  try {
  switch (resolved.action) {
      case "menu.home": await sendMainMenu(client, user, chatId); break;
      case "menu.cards": await sendCards(client, user, chatId); break;
      case "card.detail": if (resolved.entity_id) await sendCardDetail(client, user, chatId, resolved.entity_id); break;
      case "card.transactions": if (resolved.entity_id) await sendTransactions(client, user, chatId, resolved.entity_id); break;
      case "card.freeze":
      case "card.unfreeze": {
      if (!resolved.entity_id) break;
      if (!(await ownsCard(user.id, resolved.entity_id))) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
      const action = resolved.action === "card.freeze" ? "freeze" : "unfreeze";
      const result = await setKripicardCardFrozenStateForTelegram(resolved.entity_id, action, user.id, requestId);
      if (result.needsReconciliation) {
        await client.sendMessage({ chatId, text: "The card-state result is uncertain. An administrator must reconcile it before another change can be attempted." });
      } else {
        await client.sendMessage({ chatId, text: `Card is now <b>${escapeHtml(result.status)}</b>.` });
      }
      await sendCardDetail(client, user, chatId, resolved.entity_id);
      break;
    }
      case "menu.requests": await sendRequests(client, user, chatId); break;
      case "request.detail": if (resolved.entity_id) await sendCardRequestDetail(client, user, chatId, resolved.entity_id); break;
      case "menu.request_card": await beginCardRequest(client, user, chatId); break;
      case "cardreq.bin": {
        const bin = typeof resolved.payload?.bin === "string" ? resolved.payload.bin : "";
        const bins = await getCardRequestBins();
        if (!bins.some((item) => item.bin === bin)) throw new ApiError(400, "unsupported_bin", "That BIN is not currently enabled.");
        await setBotState(user.id, "card_request_amount", { bin });
        const policy = await getCardRequestPolicy();
        await client.sendMessage({ chatId, text: `Enter the initial amount in USD. Minimum: <b>${formatUsdCents(String(policy.minimumUsdCents))}</b>.` });
        break;
      }
      case "cardreq.submit": {
        const state = await getBotState(user.id);
        if (!state || state.mode !== "card_request_confirm") throw new ApiError(409, "draft_expired", "This card request draft expired. Start again.");
        const draft = state.payload;
        if (!draft.bin || !draft.amountUsdCents || !draft.nameOnCard || !draft.email) throw new ApiError(409, "draft_incomplete", "This card request draft is incomplete. Start again.");
        const created = await createTelegramCardRequest(user.id, {
          bin: draft.bin,
          amountUsdCents: draft.amountUsdCents,
          nameOnCard: draft.nameOnCard,
          email: draft.email,
          dateOfBirth: draft.dateOfBirth ?? null,
        });
        await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
        await client.sendMessage({ chatId, text: `Request <b>${escapeHtml(created.request.reference)}</b> was submitted for admin review.\nNo Kripicard card has been created and no funds have moved.` });
        await sendCardRequestDetail(client, user, chatId, created.request.id);
        break;
      }
      case "cardreq.cancel_draft":
        await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
        await client.sendMessage({ chatId, text: "Card request draft cancelled." });
        await sendMainMenu(client, user, chatId);
        break;
      case "cardreq.cancel_existing":
        if (resolved.entity_id) {
          const cancelled = await cancelTelegramCardRequest(user.id, resolved.entity_id);
          await client.sendMessage({ chatId, text: `Request <b>${escapeHtml(cancelled.reference)}</b> was cancelled.` });
          await sendRequests(client, user, chatId);
        }
        break;
      case "menu.add_funds": await beginFundingRequest(client, user, chatId); break;
      case "fundreq.card": {
        if (!resolved.entity_id) break;
        const card = await ownsCard(user.id, resolved.entity_id);
        if (!card) throw new ApiError(403, "card_not_owned", "This card is no longer available to you.");
        const policy = await getFundingPolicy();
        await setBotState(user.id, "funding_request_amount", { cardId: resolved.entity_id });
        await client.sendMessage({ chatId, text: `Enter the USD amount to add to card •${escapeHtml(card.last4 ?? "????")}. Minimum: <b>${formatUsdCents(String(policy.minimumUsdCents))}</b>.` });
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

No Kripicard funding has been executed.` });
        break;
      }
      case "fundreq.cancel_draft":
        await getPool().query(`DELETE FROM telegram_bot_states WHERE user_id=$1::uuid`, [user.id]);
        await client.sendMessage({ chatId, text: "Funding request draft cancelled." });
        await sendMainMenu(client, user, chatId);
        break;
      case "fundreq.cancel_existing":
        if (resolved.entity_id) {
          const cancelled = await cancelTelegramFundingRequest(user.id, resolved.entity_id);
          await client.sendMessage({ chatId, text: `Funding request <b>${escapeHtml(cancelled.reference)}</b> was cancelled.` });
          await sendRequests(client,user,chatId);
        }
        break;
      case "fundreq.upload_receipt":
        if (resolved.entity_id) {
          const detail = await getTelegramFundingRequest(user.id,resolved.entity_id);
          if (!["pending_receipt","correction_needed"].includes(detail.request.status)) throw new ApiError(409,"invalid_state","This request is not waiting for receipt evidence.");
          await setBotState(user.id,"funding_request_receipt",{fundingRequestId:resolved.entity_id},60);
          await client.sendMessage({chatId,text:`Upload replacement payment evidence for <b>${escapeHtml(detail.request.reference)}</b> as JPEG, PNG, WebP, or PDF.`});
        }
        break;
      case "fundreq.detail": if (resolved.entity_id) await sendFundingRequestDetail(client,user,chatId,resolved.entity_id); break;
      case "support.start": await beginSupport(client, user, chatId); break;
      default: await client.sendMessage({ chatId, text: "This action is no longer available. Use /start to reopen the menu." });
  }  } catch (error) {
    const message = error instanceof ApiError ? error.message : "This action could not be completed right now.";
    await client.sendMessage({ chatId, text: escapeHtml(message) });
    await auditTelegramEvent({ userId: user.id, action: "telegram.callback.failed", entityType: "telegram_callback", entityId: resolved.id, requestId, metadata: { action: resolved.action, errorCode: error instanceof ApiError ? error.code : "internal_error" } });
  }

}

type KycDraftPayload = {
  fullName?: string;
  dateOfBirth?: string | null;
  country?: string;
  nationalId?: string;
  phone?: string;
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

async function shouldAutoPromptKyc(userId: string): Promise<boolean> {
  const enabled = await settingValue("kyc_enabled", true);
  const autoprompt = await settingValue("kyc_autoprompt", true);
  if (!enabled || !autoprompt) return false;
  const status = await getKycStatusForUser(userId);
  return status === "none" || status === "rejected";
}

async function sendKycInvite(client: TelegramClient, user: BotUser, chatId: number) {
  const start = await createCallbackToken({ userId: user.id, action: "menu.kyc", ttlMinutes: 30 });
  await client.sendMessage({
    chatId,
    text: pick(KYC.invite, user.lang),
    replyMarkup: { inline_keyboard: [[{ text: pick(KYC.inviteButton, user.lang), callback_data: start }]] },
  });
}

async function beginKyc(client: TelegramClient, user: BotUser, chatId: number) {
  const enabled = await settingValue("kyc_enabled", true);
  if (!enabled) { await client.sendMessage({ chatId, text: pick(KYC.featureDisabled, user.lang) }); return; }
  const status = await getKycStatusForUser(user.id);
  if (status === "approved") { await client.sendMessage({ chatId, text: pick(KYC.alreadyApproved, user.lang) }); return; }
  if (status === "pending") { await client.sendMessage({ chatId, text: pick(KYC.alreadyPending, user.lang) }); return; }
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
    if (!validDob(value)) { await client.sendMessage({ chatId, text: pick(KYC.errDob, user.lang) }); return true; }
    draft.dateOfBirth = value;
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
  if (!draft.fullName || !draft.country || !draft.nationalId || !draft.phone || !draft.document) {
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
  }, user.lang);
  await client.sendMessage({
    chatId,
    text,
    replyMarkup: { inline_keyboard: [[{ text: "✅ Submit / ثبت", callback_data: submit }], [{ text: "❌ Cancel / لغو", callback_data: cancel }]] },
  });
}

async function submitKyc(client: TelegramClient, user: BotUser, chatId: number) {
  const state = await getKycState(user.id);
  if (!state || state.mode !== "kyc_confirm") throw new ApiError(409, "kyc_expired", "This KYC session expired. Send /kyc to start again.");
  const draft = state.payload;
  if (!draft.fullName || !draft.country || !draft.nationalId || !draft.phone) {
    throw new ApiError(409, "kyc_incomplete", "This KYC draft is incomplete. Send /kyc to start again.");
  }
  const created = await createKycSubmission({
    telegramUserId: user.id,
    fullName: draft.fullName,
    dateOfBirth: draft.dateOfBirth ?? null,
    country: draft.country,
    nationalId: draft.nationalId,
    phone: draft.phone,
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
    else if (await shouldAutoPromptKyc(user.id)) await sendKycInvite(client, user, chatId);
    return;
  }

  // KYC runs before the account/membership gate so brand-new customers can verify identity first.
  if (await handleKycMedia(client, user, chatId, message)) return;
  if (text && (await handleKycText(client, user, chatId, text))) return;
  if (text === "/kyc") { await beginKyc(client, user, chatId); return; }

  if (text === "/lang") { await sendLangPicker(client, user, chatId); return; }
  if (text === "/start" || text === "/menu") { await routeHome(client, user, chatId); return; }

  if (!(await assertBotAccess(client, user, chatId))) return;
  if (await handleFundingReceiptMedia(client,user,chatId,message)) return;
  if (text && await handleCardRequestText(client, user, chatId, text)) return;
  if (text && await handleFundingRequestText(client,user,chatId,text)) return;
  if (await supportMode(user.id)) {
    try {
      const stored = await storeSupportMessage(user, message, client);
      await client.sendMessage({ chatId, text: stored.duplicate ? "Support already received this message." : `Your message${stored.attachment ? " and attachment" : ""} was sent to support. Send another message, or /cancel to return to the menu.` });
    } catch (error) {
      await client.sendMessage({ chatId, text: error instanceof ApiError ? escapeHtml(error.message) : "The support message could not be stored. Please try again." });
    }
    return;
  }
  await sendMainMenu(client, user, chatId);
}

export async function processTelegramUpdate(updateInput: unknown, payloadHash: string, requestId: string) {
  const update = telegramUpdateSchema.parse(updateInput);
  const client = await getTelegramClient();
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
