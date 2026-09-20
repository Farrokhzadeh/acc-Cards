import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { reconcileTransactionNotification } from "@/server/transactions/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["acknowledge", "retry"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "transactions.reconcile");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return reconcileTransactionNotification({
      transactionId: requireUuid(id, "transaction id"),
      action: input.action,
      note: input.note,
      adminId: session.principal.id,
      requestId,
    });
  });
}
