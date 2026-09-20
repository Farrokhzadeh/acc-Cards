import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { setTelegramBotToken, clearTelegramBotToken } from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ token: z.string().trim().min(20).max(200) });

export async function PUT(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    const input = bodySchema.parse(await request.json());
    let result: { tokenHint: string };
    try {
      result = await setTelegramBotToken(input.token);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_telegram_token") {
        throw new ApiError(400, "invalid_telegram_token", "That doesn't look like a valid Telegram bot token (expected format: 123456789:ABC...).");
      }
      throw error;
    }
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "telegram.bot_token.set",
      entityType: "telegram_bot",
      entityId: "primary",
      request,
      requestId,
      metadata: { tokenHint: result.tokenHint },
    });
    return { ok: true as const, tokenHint: result.tokenHint };
  });
}

export async function DELETE(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    await clearTelegramBotToken();
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "telegram.bot_token.cleared",
      entityType: "telegram_bot",
      entityId: "primary",
      request,
      requestId,
    });
    return { ok: true as const };
  });
}
