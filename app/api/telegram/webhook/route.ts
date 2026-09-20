import { timingSafeEqual, createHash } from "node:crypto";
import { apiRoute, ApiError } from "@/server/http/api";
import { processTelegramUpdate } from "@/server/telegram/bot";
import { getTelegramCredentials } from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const creds = await getTelegramCredentials();
    if (!creds.token || !creds.webhookSecret) {
      throw new ApiError(503, "telegram_not_configured", "Telegram bot credentials are not configured.");
    }
    const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!sameSecret(supplied, creds.webhookSecret)) {
      throw new ApiError(401, "invalid_webhook_secret", "Telegram webhook verification failed.");
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new ApiError(415, "unsupported_media_type", "Telegram webhook updates must be JSON.");
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 1_000_000)) {
      throw new ApiError(413, "payload_too_large", "Telegram update is too large.");
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 1_000_000) throw new ApiError(413, "payload_too_large", "Telegram update is too large.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "invalid_json", "Telegram update JSON is invalid."); }
    return processTelegramUpdate(parsed, createHash("sha256").update(raw).digest("hex"), requestId);
  });
}
