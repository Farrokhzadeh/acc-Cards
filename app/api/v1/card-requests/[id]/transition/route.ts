import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requestIp } from "@/server/auth/request-meta";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { reviewCardRequest } from "@/server/card-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  selectedAccountId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "card_requests.review");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = bodySchema.parse(await request.json());
    return reviewCardRequest({
      requestId: requireUuid(id, "card request id"),
      action: input.action,
      selectedAccountId: input.selectedAccountId,
      note: input.note,
      adminId: session.principal.id,
      requestIdHeader: requestId,
      ip: requestIp(request),
    });
  });
}
