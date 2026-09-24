import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getDepositOptions } from "@/server/providers/kripicard/deposits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "accounts.read");
    const { id } = await context.params;
    const currency = new URL(request.url).searchParams.get("currency")?.trim() || undefined;
    return getDepositOptions(requireUuid(id, "account id"), currency);
  });
}
