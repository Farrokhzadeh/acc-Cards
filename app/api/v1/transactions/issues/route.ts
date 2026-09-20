import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { parsePageRequest } from "@/server/http/query";
import { listTransactionNotificationIssues } from "@/server/transactions/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "cards.read");
    return listTransactionNotificationIssues(parsePageRequest(request));
  });
}
