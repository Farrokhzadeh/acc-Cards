import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { listBotTexts } from "@/server/telegram/text-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "bot_texts.read");
    return { items: await listBotTexts() };
  });
}
