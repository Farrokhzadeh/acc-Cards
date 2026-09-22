import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute, ApiError } from "@/server/http/api";
import { getCardPolicy } from "@/server/settings/card-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "configuration.manage");
    return getCardPolicy();
  });
}

export async function PATCH(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "configuration.manage");
    requireCsrf(request, session);
    throw new ApiError(410, "card_policy_mutation_disabled", "The legacy client card policy is read-only. Configure the first-card minimum and BIN from First card setup.");
  });
}
