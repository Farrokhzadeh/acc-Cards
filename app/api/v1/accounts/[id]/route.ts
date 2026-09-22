import { ApiError, apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { archiveKripiAccount, updateAccountInput, updateKripiAccount } from "@/server/accounts/service";
import { requireUuid } from "@/server/http/ids";
import { serializeAccount, serializeEmailAccount, serializeTelegramUser } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "accounts.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    const uow = getUnitOfWork();
    const account = await uow.accounts.findById(id);
    if (!account) throw new ApiError(404, "not_found", "Account not found.");
    const [owner, emailAccount] = await Promise.all([
      uow.accounts.findAssignmentOwner(id),
      uow.emailAccounts.findForAccount(id),
    ]);
    return {
      account: serializeAccount(account),
      assignmentOwner: owner ? serializeTelegramUser(owner) : null,
      emailAccount: serializeEmailAccount(emailAccount),
    };
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    const input = updateAccountInput.parse(await request.json());
    await updateKripiAccount(id, input, session, request, requestId);
    return { ok: true };
  });
}


export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    await archiveKripiAccount(id, session, request, requestId);
    return { archived: true };
  });
}
