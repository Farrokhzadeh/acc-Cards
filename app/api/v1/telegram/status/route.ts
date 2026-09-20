import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { TelegramClient } from "@/server/providers/telegram/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "telegram.manage");
    const env = parseServerEnv(process.env);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
      return { configured: false, bot: null, webhook: null, expectedWebhookUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook` };
    }
    const client = new TelegramClient();
    const [bot, webhook] = await Promise.all([client.getMe(), client.getWebhookInfo()]);
    return {
      configured: true,
      bot: { id: bot.id, username: bot.username ?? null, displayName: bot.first_name },
      webhook: {
        url: webhook.url,
        pendingUpdates: webhook.pending_update_count,
        lastErrorDate: webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : null,
        lastErrorMessage: webhook.last_error_message ?? null,
        allowedUpdates: webhook.allowed_updates ?? [],
      },
      expectedWebhookUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook`,
    };
  });
}
