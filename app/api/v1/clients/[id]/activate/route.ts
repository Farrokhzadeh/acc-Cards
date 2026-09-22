import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { assignAccount } from "@/server/clients/assignments";
import { ensureOnboardingCardRequest, getOnboardingCardLink, markOnboardingCardResult } from "@/server/clients/onboarding";
import { issueApprovedCardRequest, reconcileCardIssuance } from "@/server/card-requests/issuance";
import { randomToken } from "@/server/security/crypto";
import { requestIp } from "@/server/auth/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "deny", "create_card", "reconcile_card", "complete"]),
  accountId: z.string().uuid().optional(),
});

async function enqueuePaymentNotify(userId: string, kind: "denied" | "complete") {
  await getPool().query(
    `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, available_at)
     VALUES ('telegram', 'telegram_user', $1, 'client.payment', $2::jsonb, $3, 'pending', now())`,
    [userId, JSON.stringify({ userId, kind }), `client-payment:${userId}:${kind}:${randomToken(6)}`],
  );
}

async function cardSummary(cardId: string | null | undefined) {
  if (!cardId) return { cardId: null, cardLast4: null };
  const result = await getPool().query<{ id: string; last4: string | null }>(
    `SELECT id,last4 FROM cards WHERE id=$1::uuid AND archived_at IS NULL`,
    [cardId],
  );
  return { cardId: result.rows[0]?.id ?? null, cardLast4: result.rows[0]?.last4 ?? null };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const input = schema.parse(await request.json());

    const cur = await getPool().query<{
      payment_status: string | null;
      payment_receipt_object_key: string | null;
      payment_amount_usd_cents: string | bigint | null;
      onboarding_card_id: string | null;
    }>(
      `SELECT payment_status,payment_receipt_object_key,payment_amount_usd_cents,onboarding_card_id
         FROM telegram_users WHERE id=$1::uuid`,
      [userId],
    );
    const user = cur.rows[0];
    if (!user) throw new ApiError(404, "not_found", "Client not found.");
    const current = user.payment_status ?? null;

    if (input.action === "accept") {
      if (current !== "pending") throw new ApiError(409, "invalid_state", "Payment is not pending acceptance.");
      if (!user.payment_receipt_object_key) throw new ApiError(409, "receipt_required", "A receipt is required before payment can be accepted.");
      if (!Number(user.payment_amount_usd_cents ?? 0)) throw new ApiError(409, "payment_amount_missing", "The customer payment amount is missing.");
      const kyc = await getPool().query<{ ok: boolean }>(
        `SELECT true AS ok FROM kyc_submissions WHERE telegram_user_id=$1::uuid AND status='approved' LIMIT 1`,
        [userId],
      );
      if (!kyc.rows[0]?.ok) throw new ApiError(409, "kyc_required", "Approve KYC before accepting the first-card payment.");
      await getPool().query(`UPDATE telegram_users SET payment_status='accepted',updated_at=now() WHERE id=$1::uuid`, [userId]);
      await auditAdminEvent({ adminId: session.principal.id, action: "payment.accepted", entityType: "telegram_user", entityId: userId, request, requestId });
      return { ok: true as const, status: "accepted" };
    }

    if (input.action === "deny") {
      if (current !== "pending" && current !== "accepted") throw new ApiError(409, "invalid_state", "Payment cannot be denied after first-card creation has started.");
      await getPool().query(
        `UPDATE telegram_users
            SET payment_status='denied',payment_declared_at=NULL,payment_amount_usd_cents=NULL,
                payment_receipt_object_key=NULL,payment_receipt_mime=NULL,payment_receipt_at=NULL,updated_at=now()
          WHERE id=$1::uuid`,
        [userId],
      );
      await enqueuePaymentNotify(userId, "denied");
      await auditAdminEvent({ adminId: session.principal.id, action: "payment.denied", entityType: "telegram_user", entityId: userId, request, requestId });
      return { ok: true as const, status: "denied" };
    }

    if (input.action === "create_card") {
      if (current !== "accepted" && current !== "card_creating") throw new ApiError(409, "invalid_state", "Accept the payment before creating the first card.");
      if (!input.accountId) throw new ApiError(400, "validation_error", "Choose the Kripicard account that will own this customer's first card.");
      await assignAccount({ clientId: userId, accountId: input.accountId, adminId: session.principal.id, requestId, ip: requestIp(request) });
      const onboarding = await ensureOnboardingCardRequest({
        userId,
        accountId: input.accountId,
        adminId: session.principal.id,
        requestId,
      });
      if (onboarding.status === "issued" && onboarding.cardId) {
        await markOnboardingCardResult({ userId, cardId: onboarding.cardId, status: "card_ready" });
        return { ok: true as const, status: "card_ready", ...(await cardSummary(onboarding.cardId)), needsReconciliation: false };
      }
      const result = await issueApprovedCardRequest(onboarding.requestId, session, request, requestId);
      if (result.status === "needs_reconciliation") {
        await markOnboardingCardResult({ userId, status: "card_reconciliation" });
        return { ok: true as const, status: "card_reconciliation", cardId: null, cardLast4: null, needsReconciliation: true };
      }
      await markOnboardingCardResult({ userId, cardId: result.cardId ?? null, status: "card_ready" });
      await auditAdminEvent({
        adminId: session.principal.id,
        action: "onboarding.first_card.created",
        entityType: "telegram_user",
        entityId: userId,
        request,
        requestId,
        metadata: { accountId: input.accountId, cardRequestId: onboarding.requestId, cardId: result.cardId ?? null },
      });
      return { ok: true as const, status: "card_ready", ...(await cardSummary(result.cardId)), needsReconciliation: false };
    }

    if (input.action === "reconcile_card") {
      if (current !== "card_reconciliation") throw new ApiError(409, "invalid_state", "This onboarding is not waiting for card reconciliation.");
      const link = await getOnboardingCardLink(userId);
      if (!link?.onboarding_card_request_id) throw new ApiError(409, "onboarding_request_missing", "No first-card issuance is linked to this customer.");
      const result = await reconcileCardIssuance(link.onboarding_card_request_id, session, request, requestId);
      if (result.status === "needs_reconciliation") {
        return { ok: true as const, status: "card_reconciliation", cardId: null, cardLast4: null, needsReconciliation: true };
      }
      await markOnboardingCardResult({ userId, cardId: result.cardId ?? null, status: "card_ready" });
      return { ok: true as const, status: "card_ready", ...(await cardSummary(result.cardId)), needsReconciliation: false };
    }

    if (current !== "card_ready") throw new ApiError(409, "invalid_state", "Create the customer's first card successfully before completing onboarding.");
    const link = await getOnboardingCardLink(userId);
    if (!link?.onboarding_card_id) throw new ApiError(409, "card_required", "The first card is not linked to this onboarding.");
    const owned = await getPool().query<{ id: string; last4: string | null }>(
      `SELECT c.id,c.last4
         FROM cards c
         JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
        WHERE c.id=$1::uuid AND taa.telegram_user_id=$2::uuid AND c.archived_at IS NULL
        LIMIT 1`,
      [link.onboarding_card_id,userId],
    );
    if (!owned.rows[0]) throw new ApiError(409, "card_not_assigned", "The created first card is no longer reachable through the customer's assigned account.");
    await getPool().query(`UPDATE telegram_users SET payment_status='complete',updated_at=now() WHERE id=$1::uuid`, [userId]);
    await enqueuePaymentNotify(userId, "complete");
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "onboarding.completed",
      entityType: "telegram_user",
      entityId: userId,
      request,
      requestId,
      metadata: { cardId: owned.rows[0].id, last4: owned.rows[0].last4 },
    });
    return { ok: true as const, status: "complete", cardId: owned.rows[0].id, cardLast4: owned.rows[0].last4, needsReconciliation: false };
  });
}
