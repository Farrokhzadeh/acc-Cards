import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { collectOperationalSnapshot } from "@/server/operations/service";
import { listRuntimeControls } from "@/server/operations/controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "operations.read");
    const [snapshot, controls] = await Promise.all([collectOperationalSnapshot(), listRuntimeControls()]);
    return {
      ...snapshot,
      controls,
      canManageControls: session.principal.role === "super_admin" || session.principal.permissions.includes("operations.controls.manage"),
    };
  });
}
