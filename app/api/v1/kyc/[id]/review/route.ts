import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { reviewKycSubmission } from "@/server/kyc/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "kyc.review");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = bodySchema.parse(await request.json());
    return reviewKycSubmission({
      id: requireUuid(id, "kyc id"),
      decision: input.decision,
      note: input.note ?? null,
      adminId: session.principal.id,
      request,
      requestId,
    });
  });
}
