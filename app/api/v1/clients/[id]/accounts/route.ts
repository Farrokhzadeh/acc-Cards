import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { listAssignableAccounts } from "@/server/clients/assignments";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "clients.read");
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";
    const parsedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    return { items: await listAssignableAccounts(clientId, search, limit) };
  });
}

async function rejectStandaloneAssignment(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    throw new ApiError(410, "assignment_managed_by_onboarding", "Kripicard account assignment is managed by first-card onboarding and cannot be changed independently.");
  });
}

export async function POST(request: Request) {
  return rejectStandaloneAssignment(request);
}

export async function PUT(request: Request) {
  return rejectStandaloneAssignment(request);
}

export async function DELETE(request: Request) {
  return rejectStandaloneAssignment(request);
}
