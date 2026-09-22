import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute, ApiError } from "@/server/http/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function rejectStandaloneAssignment(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    throw new ApiError(410, "assignment_managed_by_onboarding", "Kripicard account assignment is managed by first-card onboarding and cannot be changed independently.");
  });
}

export async function PUT(request: Request) {
  return rejectStandaloneAssignment(request);
}

export async function DELETE(request: Request) {
  return rejectStandaloneAssignment(request);
}
