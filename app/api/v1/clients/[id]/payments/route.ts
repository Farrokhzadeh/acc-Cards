import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { listCustomerPaymentsForAdmin } from "@/server/payments/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "payments.read");
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    return { items: await listCustomerPaymentsForAdmin(userId) };
  });
}
