import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { runtimeControlEnabled } from "@/server/operations/controls";

export type TelegramInlineButton = { text: string; callback_data?: string; url?: string };
export type TelegramInlineKeyboard = { inline_keyboard: TelegramInlineButton[][] };

type TelegramEnvelope<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

export type TelegramBotIdentity = { id: number; is_bot: boolean; first_name: string; username?: string };
export type TelegramWebhookInfo = {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};
export type TelegramSentMessage = { message_id: number; chat: { id: number }; date: number; text?: string };
export type TelegramChatMember = { status: string; is_member?: boolean };
export type TelegramFile = { file_id: string; file_unique_id: string; file_size?: number; file_path?: string };

export class TelegramClient {
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(token?: string) {
    const env = parseServerEnv(process.env);
    const configured = token ?? env.TELEGRAM_BOT_TOKEN;
    if (!configured) throw new ApiError(503, "telegram_not_configured", "Telegram bot credentials are not configured.");
    this.token = configured;
    this.timeoutMs = env.TELEGRAM_REQUEST_TIMEOUT_MS;
  }

  private async call<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as TelegramEnvelope<T> | null;
      if (!response.ok || !body?.ok || body.result === undefined) {
        const message = body?.description?.slice(0, 300) || `Telegram API ${method} failed.`;
        const code = body?.error_code ?? response.status;
        if (code === 429) throw new ApiError(503, "telegram_rate_limited", message, { retryAfter: body?.parameters?.retry_after ?? null });
        if (code === 401) throw new ApiError(503, "telegram_token_invalid", "Telegram rejected the configured bot token.");
        throw new ApiError(502, "telegram_provider_error", message);
      }
      return body.result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ApiError(504, "telegram_timeout", "Telegram did not respond before the timeout.");
      throw new ApiError(502, "telegram_network_error", "Telegram could not be reached.");
    } finally {
      clearTimeout(timer);
    }
  }


  private async callMultipart<T>(method: string, form: FormData): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", body: form, signal: controller.signal });
      const body = (await response.json().catch(() => null)) as TelegramEnvelope<T> | null;
      if (!response.ok || !body?.ok || body.result === undefined) {
        const message = body?.description?.slice(0, 300) || `Telegram API ${method} failed.`;
        const code = body?.error_code ?? response.status;
        if (code === 429) throw new ApiError(503, "telegram_rate_limited", message, { retryAfter: body?.parameters?.retry_after ?? null });
        if (code === 401) throw new ApiError(503, "telegram_token_invalid", "Telegram rejected the configured bot token.");
        throw new ApiError(502, "telegram_provider_error", message);
      }
      return body.result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ApiError(504, "telegram_timeout", "Telegram did not respond before the timeout.");
      throw new ApiError(502, "telegram_network_error", "Telegram could not be reached.");
    } finally { clearTimeout(timer); }
  }

  getMe() { return this.call<TelegramBotIdentity>("getMe"); }
  getWebhookInfo() { return this.call<TelegramWebhookInfo>("getWebhookInfo"); }

  setWebhook(input: { url: string; secretToken: string }) {
    return this.call<boolean>("setWebhook", {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  async sendMessage(input: {
    chatId: number | string;
    text: string;
    replyMarkup?: TelegramInlineKeyboard;
    protectContent?: boolean;
    disableWebPagePreview?: boolean;
  }) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.call<TelegramSentMessage>("sendMessage", {
      chat_id: input.chatId,
      text: input.text,
      parse_mode: "HTML",
      reply_markup: input.replyMarkup,
      protect_content: input.protectContent ?? false,
      link_preview_options: input.disableWebPagePreview === false ? undefined : { is_disabled: true },
    });
  }


  async sendDocument(input: {
    chatId: number | string;
    bytes: Buffer;
    filename: string;
    mimeType: string;
    caption?: string;
    protectContent?: boolean;
  }) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    const form = new FormData();
    form.set("chat_id", String(input.chatId));
    form.set("document", new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.filename);
    if (input.caption) form.set("caption", input.caption);
    form.set("parse_mode", "HTML");
    form.set("protect_content", input.protectContent ? "true" : "false");
    return this.callMultipart<TelegramSentMessage>("sendDocument", form);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.call<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  getChatMember(chatId: number | string, userId: number | string) {
    return this.call<TelegramChatMember>("getChatMember", { chat_id: chatId, user_id: userId });
  }

  getFile(fileId: string) {
    return this.call<TelegramFile>("getFile", { file_id: fileId });
  }

  async downloadFile(filePath: string, maxBytes: number) {
    if (!filePath || filePath.includes("..") || filePath.startsWith("/")) throw new ApiError(400, "telegram_file_path_invalid", "Telegram returned an invalid file path.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`, { signal: controller.signal });
      if (!response.ok) throw new ApiError(502, "telegram_file_download_failed", "Telegram could not provide the uploaded file.");
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > maxBytes) throw new ApiError(413, "receipt_too_large", "The uploaded receipt exceeds the configured size limit.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw new ApiError(413, "receipt_too_large", "The uploaded receipt exceeds the configured size limit.");
      return bytes;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ApiError(504, "telegram_timeout", "Telegram file download timed out.");
      throw new ApiError(502, "telegram_file_download_failed", "Telegram could not provide the uploaded file.");
    } finally { clearTimeout(timer); }
  }
}
