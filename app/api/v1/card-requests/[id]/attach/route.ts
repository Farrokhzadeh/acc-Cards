import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { attachExistingCardToRequest } from "@/server/card-requests/issuance";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ cardId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "card_requests.issue");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return attachExistingCardToRequest(
      requireUuid(id, "card request id"),
      input.cardId,
      session,
      request,
      requestId,
    );
  });
}
