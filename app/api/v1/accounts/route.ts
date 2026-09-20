import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { createAccountInput, createKripiAccount } from "@/server/accounts/service";
import { parsePageRequest } from "@/server/http/query";
import { serializeAccount } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "accounts.read");
    const page = parsePageRequest(request);
    const result = await getUnitOfWork().accounts.list(page);
    return { items: result.items.map(serializeAccount), nextCursor: result.nextCursor ?? null };
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    const input = createAccountInput.parse(await request.json());
    const id = await createKripiAccount(input, session, request, requestId);
    return new Response(JSON.stringify({ data: { id }, requestId }), {
      status: 201,
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId },
    });
  });
}
