import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { assignAccount } from "@/server/clients/assignments";
import { randomToken } from "@/server/security/crypto";
import { requestIp } from "@/server/auth/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "deny", "complete"]),
  accountId: z.string().uuid().optional(),
});

async function enqueuePaymentNotify(userId: string, kind: "denied" | "complete") {
  await getPool().query(
    `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, available_at)
     VALUES ('telegram', 'telegram_user', $1, 'client.payment', $2::jsonb, $3, 'pending', now())`,
    [userId, JSON.stringify({ userId, kind }), `client-payment:${userId}:${kind}:${randomToken(6)}`],
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const input = schema.parse(await request.json());

    const cur = await getPool().query<{ status: string | null }>(`SELECT payment_status FROM telegram_users WHERE id = $1::uuid`, [userId]);
    const current = cur.rows[0]?.status ?? null;

    if (input.action === "accept") {
      if (current !== "pending") throw new ApiError(409, "invalid_state", "Payment is not pending acceptance.");
      await getPool().query(`UPDATE telegram_users SET payment_status = 'accepted', updated_at = now() WHERE id = $1::uuid`, [userId]);
      await auditAdminEvent({ adminId: session.principal.id, action: "payment.accepted", entityType: "telegram_user", entityId: userId, request, requestId });
      return { ok: true as const, status: "accepted" };
    }

    if (input.action === "deny") {
      if (current !== "pending" && current !== "accepted") throw new ApiError(409, "invalid_state", "Payment cannot be denied now.");
      await getPool().query(`UPDATE telegram_users SET payment_status = 'denied', updated_at = now() WHERE id = $1::uuid`, [userId]);
      await enqueuePaymentNotify(userId, "denied");
      await auditAdminEvent({ adminId: session.principal.id, action: "payment.denied", entityType: "telegram_user", entityId: userId, request, requestId });
      return { ok: true as const, status: "denied" };
    }

    // complete: assign account (activation) + notify; Ucard comes from the assigned account.
    if (!input.accountId) throw new ApiError(400, "validation_error", "Choose an account to assign before completing.");
    if (current !== "accepted" && current !== "pending") throw new ApiError(409, "invalid_state", "Accept the payment before completing activation.");
    await assignAccount({ clientId: userId, accountId: input.accountId, adminId: session.principal.id, requestId, ip: requestIp(request) });
    await getPool().query(`UPDATE telegram_users SET payment_status = 'complete', updated_at = now() WHERE id = $1::uuid`, [userId]);
    await enqueuePaymentNotify(userId, "complete");
    await auditAdminEvent({ adminId: session.principal.id, action: "payment.completed", entityType: "telegram_user", entityId: userId, request, requestId, metadata: { accountId: input.accountId } });
    return { ok: true as const, status: "complete" };
  });
}
