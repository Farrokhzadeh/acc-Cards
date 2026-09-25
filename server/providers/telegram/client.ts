import { Api, GrammyError, HttpError, InputFile } from "grammy";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { runtimeControlEnabled } from "@/server/operations/controls";

export type TelegramInlineButton = { text: string; callback_data: string; url?: never } | { text: string; url: string; callback_data?: never };
export type TelegramInlineKeyboard = { inline_keyboard: TelegramInlineButton[][] };
export type TelegramBotIdentity = Awaited<ReturnType<Api["getMe"]>>;
export type TelegramWebhookInfo = Awaited<ReturnType<Api["getWebhookInfo"]>>;
export type TelegramSentMessage = Awaited<ReturnType<Api["sendMessage"]>>;
export type TelegramChatMember = Awaited<ReturnType<Api["getChatMember"]>>;
export type TelegramFile = Awaited<ReturnType<Api["getFile"]>>;

export class TelegramClient {
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly api: Api;

  constructor(token?: string) {
    const env = parseServerEnv(process.env);
    const configured = token ?? env.TELEGRAM_BOT_TOKEN;
    if (!configured) throw new ApiError(503, "telegram_not_configured", "Telegram bot credentials are not configured.");
    this.token = configured;
    this.timeoutMs = env.TELEGRAM_REQUEST_TIMEOUT_MS;
    this.api = new Api(configured, { timeoutSeconds: Math.max(1, Math.ceil(this.timeoutMs / 1000)) });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GrammyError) {
        const message = error.description.slice(0, 300);
        if (error.error_code === 429) {
          const retryAfter = typeof error.parameters?.retry_after === "number" ? error.parameters.retry_after : null;
          throw new ApiError(503, "telegram_rate_limited", message, { retryAfter });
        }
        if (error.error_code === 401) throw new ApiError(503, "telegram_token_invalid", "Telegram rejected the configured bot token.");
        throw new ApiError(502, "telegram_provider_error", message);
      }
      if (error instanceof HttpError) throw new ApiError(502, "telegram_network_error", "Telegram could not be reached.");
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "telegram_network_error", "Telegram could not be reached.");
    }
  }

  getMe() { return this.run(() => this.api.getMe()); }
  getWebhookInfo() { return this.run(() => this.api.getWebhookInfo()); }
  setWebhook(input: { url: string; secretToken: string }) {
    return this.run(() => this.api.setWebhook(input.url, { secret_token: input.secretToken, allowed_updates: ["message", "callback_query"], drop_pending_updates: false }));
  }
  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.run(() => this.api.setMyCommands(commands));
  }

  async sendMessage(input: { chatId: number | string; text: string; replyMarkup?: TelegramInlineKeyboard; protectContent?: boolean; disableWebPagePreview?: boolean }) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.run(() => this.api.sendMessage(input.chatId, input.text, {
      parse_mode: "HTML",
      reply_markup: input.replyMarkup,
      protect_content: input.protectContent ?? false,
      link_preview_options: input.disableWebPagePreview === false ? undefined : { is_disabled: true },
    }));
  }

  async sendPhoto(input: { chatId: number | string; bytes: Buffer; filename: string; caption?: string; protectContent?: boolean }) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.run(() => this.api.sendPhoto(input.chatId, new InputFile(input.bytes, input.filename), {
      caption: input.caption,
      parse_mode: "HTML",
      protect_content: input.protectContent ?? false,
    }));
  }

  async sendDocument(input: { chatId: number | string; bytes: Buffer; filename: string; mimeType: string; caption?: string; protectContent?: boolean }) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.run(() => this.api.sendDocument(input.chatId, new InputFile(input.bytes, input.filename), {
      caption: input.caption,
      parse_mode: "HTML",
      protect_content: input.protectContent ?? false,
    }));
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    if (!await runtimeControlEnabled("telegram_sends")) throw new ApiError(503, "runtime_kill_switch", "Telegram sends are disabled by an emergency runtime control.");
    return this.run(() => this.api.answerCallbackQuery(callbackQueryId, { text, show_alert: showAlert }));
  }

  getChatMember(chatId: number | string, userId: number | string) {
    const parsedUserId = typeof userId === "number" ? userId : Number(userId);
    if (!Number.isSafeInteger(parsedUserId)) throw new ApiError(400, "telegram_user_id_invalid", "Telegram user ID is invalid.");
    return this.run(() => this.api.getChatMember(chatId, parsedUserId));
  }

  getFile(fileId: string) { return this.run(() => this.api.getFile(fileId)); }

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
