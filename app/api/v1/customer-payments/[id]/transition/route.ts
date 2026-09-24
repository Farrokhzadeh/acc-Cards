import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { reviewCustomerPayment } from "@/server/payments/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "correction", "reject"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "payments.review");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return reviewCustomerPayment({
      paymentId: requireUuid(id, "payment id"),
      action: input.action,
      note: input.note ?? null,
      adminId: session.principal.id,
    });
  });
}
