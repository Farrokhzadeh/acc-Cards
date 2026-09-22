import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { getCardRequestBins } from "@/server/card-requests/service";
import { getPaymentCard } from "@/server/settings/payment-card";

type OnboardingRequestRow = {
  id: string;
  status: string;
  provider_card_id: string | null;
  selected_account_id: string | null;
};

export async function ensureOnboardingCardRequest(args: {
  userId: string;
  accountId: string;
  adminId: string;
  requestId: string;
}) {
  return withTransaction(async (db) => {
    const userResult = await db.query<{
      payment_status: string | null;
      payment_amount_usd_cents: string | bigint | null;
      payment_receipt_object_key: string | null;
      onboarding_card_request_id: string | null;
      onboarding_card_id: string | null;
    }>(
      `SELECT payment_status,payment_amount_usd_cents,payment_receipt_object_key,onboarding_card_request_id,onboarding_card_id
         FROM telegram_users
        WHERE id=$1::uuid
        FOR UPDATE`,
      [args.userId],
    );
    const user = userResult.rows[0];
    if (!user) throw new ApiError(404, "client_not_found", "Telegram client not found.");
    if (user.payment_status !== "accepted" && user.payment_status !== "card_creating" && user.payment_status !== "card_reconciliation" && user.payment_status !== "card_ready") {
      throw new ApiError(409, "invalid_state", "Accept the customer's receipt before creating the first card.");
    }
    if (!user.payment_receipt_object_key) {
      throw new ApiError(409, "receipt_required", "A payment receipt is required before first-card creation.");
    }
    const amountUsdCents = Number(user.payment_amount_usd_cents ?? 0);
    if (!Number.isSafeInteger(amountUsdCents) || amountUsdCents <= 0) {
      throw new ApiError(409, "payment_amount_missing", "The customer's first-card payment amount is missing.");
    }

    if (user.onboarding_card_request_id) {
      const existing = await db.query<OnboardingRequestRow>(
        `SELECT id,status,provider_card_id,selected_account_id FROM card_requests WHERE id=$1::uuid`,
        [user.onboarding_card_request_id],
      );
      const row = existing.rows[0];
      if (!row) throw new ApiError(409, "onboarding_request_missing", "The linked onboarding card request no longer exists.");
      if (row.selected_account_id && row.selected_account_id !== args.accountId) {
        throw new ApiError(409, "onboarding_account_locked", "This first-card issuance is already tied to a different Kripicard account.");
      }
      return { requestId: row.id, status: row.status, providerCardId: row.provider_card_id, cardId: user.onboarding_card_id };
    }

    const kyc = await db.query<{ full_name: string; date_of_birth: Date | string | null }>(
      `SELECT full_name,date_of_birth
         FROM kyc_submissions
        WHERE telegram_user_id=$1::uuid AND status='approved'
        ORDER BY reviewed_at DESC NULLS LAST, submitted_at DESC
        LIMIT 1`,
      [args.userId],
    );
    const approvedKyc = kyc.rows[0];
    if (!approvedKyc) throw new ApiError(409, "kyc_required", "Approved KYC is required before first-card creation.");

    const account = await db.query<{ id: string; email: string }>(
      `SELECT a.id,COALESCE(ea.email_address,a.login_email) AS email
         FROM kripi_accounts a
         LEFT JOIN email_accounts ea ON ea.account_id=a.id
        WHERE a.id=$1::uuid AND a.archived_at IS NULL AND a.status NOT IN ('disabled','archived')
        FOR UPDATE OF a`,
      [args.accountId],
    );
    if (!account.rows[0]) throw new ApiError(409, "account_unavailable", "The selected Kripicard account is unavailable.");

    const paymentConfig = await getPaymentCard();

    const bins = await getCardRequestBins(db);
    const onboardingBin = paymentConfig.onboardingBin || bins[0]?.bin || "";
    const configuredBin = bins.find((item) => item.bin === onboardingBin);
    if (!configuredBin) {
      throw new ApiError(409, "onboarding_bin_unavailable", "Configure a valid first-card BIN in Settings before creating a card.");
    }
    const dob = approvedKyc.date_of_birth
      ? (approvedKyc.date_of_birth instanceof Date ? approvedKyc.date_of_birth.toISOString().slice(0, 10) : String(approvedKyc.date_of_birth).slice(0, 10))
      : null;
    if (configuredBin.requiresDob && !dob) {
      throw new ApiError(409, "date_of_birth_required", "The configured first-card BIN requires a date of birth, but approved KYC has none.");
    }

    const result = await db.query<{ id: string; reference: string }>(
      `INSERT INTO card_requests(
         reference,user_id,preferred_account_id,selected_account_id,bin,initial_amount_usd_cents,
         name_on_card,email,date_of_birth,status,reviewed_by,admin_note
       ) VALUES(
         'ONB-' || nextval('card_request_reference_seq')::text,$1::uuid,$2::uuid,$2::uuid,$3,$4,$5,$6,$7::date,
         'approved',$8::uuid,'Created automatically from approved first-card payment'
       )
       RETURNING id,reference`,
      [args.userId,args.accountId,onboardingBin,amountUsdCents,approvedKyc.full_name,account.rows[0].email,configuredBin.requiresDob ? dob : null,args.adminId],
    );
    const request = result.rows[0]!;
    await db.query(
      `INSERT INTO card_request_events(request_id,from_status,to_status,actor_type,admin_id,note,safe_metadata)
       VALUES($1::uuid,NULL,'approved','admin',$2::uuid,'First-card onboarding issuance created',$3::jsonb)`,
      [request.id,args.adminId,JSON.stringify({ onboarding: true, accountId: args.accountId, amountUsdCents })],
    );
    await db.query(
      `UPDATE telegram_users
          SET onboarding_card_request_id=$2::uuid,payment_status='card_creating',updated_at=now()
        WHERE id=$1::uuid`,
      [args.userId,request.id],
    );
    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,request_id)
       VALUES('admin',$1::uuid,'onboarding.card_request.created','telegram_user',$2,$3::jsonb,$4)`,
      [args.adminId,args.userId,JSON.stringify({ cardRequestId: request.id, reference: request.reference, accountId: args.accountId, amountUsdCents, bin: onboardingBin }),args.requestId],
    );
    return { requestId: request.id, status: "approved", providerCardId: null, cardId: null };
  });
}

export async function markOnboardingCardResult(args: {
  userId: string;
  cardId?: string | null;
  status: "card_ready" | "card_reconciliation";
}) {
  await getPool().query(
    `UPDATE telegram_users
        SET payment_status=$2,
            onboarding_card_id=COALESCE($3::uuid,onboarding_card_id),
            updated_at=now()
      WHERE id=$1::uuid`,
    [args.userId,args.status,args.cardId ?? null],
  );
}

export async function getOnboardingCardLink(userId: string) {
  const result = await getPool().query<{
    payment_status: string | null;
    onboarding_card_request_id: string | null;
    onboarding_card_id: string | null;
  }>(
    `SELECT payment_status,onboarding_card_request_id,onboarding_card_id FROM telegram_users WHERE id=$1::uuid`,
    [userId],
  );
  return result.rows[0] ?? null;
}
