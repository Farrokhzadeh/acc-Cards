import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getKycSubmission } from "@/server/kyc/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "kyc.read");
    const { id } = await context.params;
    const item = await getKycSubmission(requireUuid(id, "kyc id"));
    if (!item) throw new ApiError(404, "not_found", "KYC submission not found.");
    return item;
  });
}
