import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getTelegramCredentials } from "@/server/telegram/credentials";
import { TelegramClient } from "@/server/providers/telegram/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    const env = parseServerEnv(process.env);
    const creds = await getTelegramCredentials();
    if (!creds.token || !creds.webhookSecret) throw new ApiError(503, "telegram_not_configured", "Set the bot token first (Settings → Telegram).");
    const url = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook`;
    const client = new TelegramClient(creds.token);
    await client.setWebhook({ url, secretToken: creds.webhookSecret });
    const webhook = await client.getWebhookInfo();
    await auditAdminEvent({ adminId: session.principal.id, action: "telegram.webhook.configure", entityType: "telegram_bot", entityId: "primary", request, requestId, metadata: { url } });
    return { configured: true, url: webhook.url, pendingUpdates: webhook.pending_update_count, lastErrorMessage: webhook.last_error_message ?? null };
  });
}
