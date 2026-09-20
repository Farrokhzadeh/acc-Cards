import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request);
    return {
      admin: session.principal,
      reauthenticatedAt: session.reauthenticatedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
    };
  });
}
