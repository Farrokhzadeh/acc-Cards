import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, requireRecentReauthentication, auditAdminEvent } from "@/server/auth/service";
import { TelegramClient } from "@/server/providers/telegram/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const env = parseServerEnv(process.env);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) throw new ApiError(503, "telegram_not_configured", "Configure TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first.");
    const url = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook`;
    const client = new TelegramClient();
    await client.setWebhook({ url, secretToken: env.TELEGRAM_WEBHOOK_SECRET });
    const webhook = await client.getWebhookInfo();
    await auditAdminEvent({ adminId: session.principal.id, action: "telegram.webhook.configure", entityType: "telegram_bot", entityId: "primary", request, requestId, metadata: { url } });
    return { configured: true, url: webhook.url, pendingUpdates: webhook.pending_update_count, lastErrorMessage: webhook.last_error_message ?? null };
  });
}
