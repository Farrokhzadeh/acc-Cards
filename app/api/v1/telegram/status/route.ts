import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { getTelegramCredentials, getTelegramClient } from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "telegram.manage");
    const env = parseServerEnv(process.env);
    const expectedWebhookUrl = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook`;
    const creds = await getTelegramCredentials();
    const configured = Boolean(creds.token && creds.webhookSecret);
    const base = { configured, tokenSource: creds.source, tokenHint: creds.tokenHint, expectedWebhookUrl };

    if (!configured) {
      return { ...base, bot: null, webhook: null };
    }
    try {
      const client = await getTelegramClient();
      const [bot, webhook] = await Promise.all([client.getMe(), client.getWebhookInfo()]);
      return {
        ...base,
        bot: { id: bot.id, username: bot.username ?? null, displayName: bot.first_name },
        webhook: {
          url: webhook.url,
          pendingUpdates: webhook.pending_update_count,
          lastErrorDate: webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : null,
          lastErrorMessage: webhook.last_error_message ?? null,
          allowedUpdates: webhook.allowed_updates ?? [],
        },
      };
    } catch (error) {
      return { ...base, bot: null, webhook: null, error: error instanceof Error ? error.message : "telegram_unreachable" };
    }
  });
}
