import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { setKripicardCardFrozenState } from "@/server/providers/kripicard/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  action: z.enum(["freeze", "unfreeze"]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "cards.operate");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "card id");
    const input = inputSchema.parse(await request.json());
    return setKripicardCardFrozenState(id, input.action, session, request, requestId);
  });
}
