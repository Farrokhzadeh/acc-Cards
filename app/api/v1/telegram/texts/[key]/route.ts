import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { resetBotText, updateBotText, updateBotTextInput } from "@/server/telegram/text-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "bot_texts.manage");
    requireCsrf(request, session);
    const { key } = await context.params;
    return updateBotText(decodeURIComponent(key), updateBotTextInput.parse(await request.json()), session, request, requestId);
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "bot_texts.manage");
    requireCsrf(request, session);
    const { key } = await context.params;
    return resetBotText(decodeURIComponent(key), session, request, requestId);
  });
}
