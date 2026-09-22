import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request);
    const result = await getPool().query<{ id: string; declared: boolean; status: string | null }>(
      `SELECT id, (payment_declared_at IS NOT NULL) AS declared, payment_status AS status FROM telegram_users`,
    );
    return { items: result.rows };
  });
}
