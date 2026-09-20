import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { revealKripiAccountSecrets } from "@/server/accounts/service";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.secrets.reveal");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    return revealKripiAccountSecrets(id, session, request, requestId);
  });
}
