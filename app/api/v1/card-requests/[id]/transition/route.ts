import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { reviewCardRequest } from "@/server/card-requests/service";
import { requestIp } from "@/server/auth/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  selectedAccountId: z.string().uuid().optional(),
  selectedBin: z.string().regex(/^\d{6}$/).optional(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "card_requests.review");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return reviewCardRequest({
      requestId: requireUuid(id, "card request id"),
      action: input.action,
      selectedAccountId: input.selectedAccountId ?? null,
      selectedBin: input.selectedBin ?? null,
      note: input.note ?? null,
      adminId: session.principal.id,
      requestIdHeader: requestId,
      ip: requestIp(request),
    });
  });
}
