import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { serializeAccount, serializeCard, serializeClient, serializeEmailAccount } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "dashboard.read");
    const uow = getUnitOfWork();
    const [accountPage, cardPage, clientPage] = await Promise.all([
      uow.accounts.list({ limit: 100 }),
      uow.cards.list({ limit: 100 }),
      uow.telegramUsers.list({ limit: 100 }),
    ]);
    const emailAccounts = await Promise.all(
      accountPage.items.map(async (account) => [account.id, await uow.emailAccounts.findForAccount(account.id)] as const),
    );
    const emailByAccount = new Map(emailAccounts);
    return {
      accounts: accountPage.items.map((account) => ({
        ...serializeAccount(account),
        emailAccount: serializeEmailAccount(emailByAccount.get(account.id) ?? null),
      })),
      cards: cardPage.items.map(serializeCard),
      clients: clientPage.items.map(serializeClient),
      partial: Boolean(accountPage.nextCursor || cardPage.nextCursor || clientPage.nextCursor),
    };
  });
}
