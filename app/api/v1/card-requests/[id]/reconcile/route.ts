import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute, ApiError } from "@/server/http/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    throw new ApiError(410, "card_request_flow_disabled", "Standalone card requests are disabled. The customer's first card is created only through first-card onboarding.");
  });
}
