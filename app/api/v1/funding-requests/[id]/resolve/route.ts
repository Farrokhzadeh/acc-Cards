import { z } from "zod";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { resolveFundingReconciliation } from "@/server/funding/execution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  outcome: z.enum(["completed", "not_funded"]),
  providerReference: z.string().trim().min(3).max(500),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "funding.execute");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id } = await context.params;
    const input = bodySchema.parse(await request.json());
    return resolveFundingReconciliation({
      requestId: requireUuid(id, "funding request id"),
      outcome: input.outcome,
      providerReference: input.providerReference,
      note: input.note,
      session,
      request,
      traceId: requestId,
    });
  });
}
