import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { getCardRequestBins } from "@/server/card-requests/service";
import { getFirstCardSettings } from "@/server/settings/first-card";
import { assignAccountInTransaction, unassignAccountInTransaction } from "@/server/clients/assignments";

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
  ip?: string | null;
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

    const account = await db.query<{ id: string; email: string; encrypted_api_key: string }>(
      `SELECT a.id,COALESCE(ea.email_address,a.login_email) AS email,a.encrypted_api_key
         FROM kripi_accounts a
         LEFT JOIN email_accounts ea ON ea.account_id=a.id
        WHERE a.id=$1::uuid AND a.archived_at IS NULL AND a.status NOT IN ('disabled','archived')
        FOR UPDATE OF a`,
      [args.accountId],
    );
    if (!account.rows[0]) throw new ApiError(409, "account_unavailable", "The selected Kripicard account is unavailable.");
    if (!account.rows[0].encrypted_api_key.startsWith("v1.")) {
      throw new ApiError(409, "secret_unavailable", "The selected Kripicard account needs a valid encrypted API key before first-card creation.");
    }

    if (user.onboarding_card_request_id) {
      const existing = await db.query<OnboardingRequestRow>(
        `SELECT id,status,provider_card_id,selected_account_id FROM card_requests WHERE id=$1::uuid`,
        [user.onboarding_card_request_id],
      );
      const row = existing.rows[0];
      if (!row) throw new ApiError(409, "onboarding_request_missing", "The linked onboarding card request no longer exists.");
      if (row.selected_account_id && row.selected_account_id !== args.accountId) {
        if (!["approved", "issue_failed"].includes(row.status) || user.onboarding_card_id) {
          throw new ApiError(409, "onboarding_account_locked", "This first-card issuance has reached a state where its Kripicard account cannot be changed safely.");
        }
        await unassignAccountInTransaction(db, {
          clientId: args.userId,
          accountId: row.selected_account_id,
          adminId: args.adminId,
          requestId: args.requestId,
          ip: args.ip,
        });
        await assignAccountInTransaction(db, {
          clientId: args.userId,
          accountId: args.accountId,
          adminId: args.adminId,
          requestId: args.requestId,
          ip: args.ip,
        });
        await db.query(
          `UPDATE card_requests
              SET preferred_account_id=$2::uuid,selected_account_id=$2::uuid,email=$3,updated_at=now()
            WHERE id=$1::uuid`,
          [row.id, args.accountId, account.rows[0].email],
        );
        await db.query(
          `INSERT INTO card_request_events(request_id,from_status,to_status,actor_type,admin_id,note,safe_metadata)
           VALUES($1::uuid,$2,$2,'admin',$3::uuid,'Issuing account changed after a safely retryable onboarding failure',$4::jsonb)`,
          [row.id,row.status,args.adminId,JSON.stringify({ previousAccountId: row.selected_account_id, accountId: args.accountId })],
        );
        await db.query(
          `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,request_id)
           VALUES('admin',$1::uuid,'onboarding.issuing_account.changed','telegram_user',$2,$3::jsonb,$4)`,
          [args.adminId,args.userId,JSON.stringify({ cardRequestId: row.id, previousAccountId: row.selected_account_id, accountId: args.accountId, requestStatus: row.status }),args.requestId],
        );
      } else {
        await assignAccountInTransaction(db, {
          clientId: args.userId,
          accountId: args.accountId,
          adminId: args.adminId,
          requestId: args.requestId,
          ip: args.ip,
        });
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

    const firstCardSettings = await getFirstCardSettings();

    const bins = await getCardRequestBins(db);
    const onboardingBin = firstCardSettings.onboardingBin || bins[0]?.bin || "";
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

    await assignAccountInTransaction(db, {
      clientId: args.userId,
      accountId: args.accountId,
      adminId: args.adminId,
      requestId: args.requestId,
      ip: args.ip,
    });

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

export async function attachExistingOnboardingCard(args: {
  userId: string;
  requestId: string;
  accountId: string;
  cardId: string;
  adminId: string;
  traceId: string;
  ip?: string | null;
}) {
  return withTransaction(async (db) => {
    const userResult = await db.query<{ onboarding_card_id: string | null; payment_status: string | null }>(
      `SELECT onboarding_card_id,payment_status FROM telegram_users WHERE id=$1::uuid FOR UPDATE`,
      [args.userId],
    );
    const user = userResult.rows[0];
    if (!user) throw new ApiError(404, "client_not_found", "Telegram client not found.");
    if (!["card_creating", "card_reconciliation", "card_ready"].includes(user.payment_status ?? "")) {
      throw new ApiError(409, "invalid_state", "Accept the payment and prepare the first-card request before attaching an existing card.");
    }
    if (user.onboarding_card_id && user.onboarding_card_id !== args.cardId) {
      throw new ApiError(409, "card_already_attached", "A different first card is already attached to this customer.");
    }
    const requestResult = await db.query<OnboardingRequestRow & { last_issue_operation_id: string | null }>(
      `SELECT id,status,provider_card_id,selected_account_id,last_issue_operation_id
         FROM card_requests WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE`,
      [args.requestId,args.userId],
    );
    const cardRequest = requestResult.rows[0];
    if (!cardRequest) throw new ApiError(409, "onboarding_request_missing", "The first-card request is missing.");
    if (!["approved", "issuing", "issue_failed", "needs_reconciliation", "issued"].includes(cardRequest.status)) {
      throw new ApiError(409, "invalid_request_state", "This first-card request cannot accept an existing card in its current state.");
    }
    if (cardRequest.selected_account_id !== args.accountId) {
      throw new ApiError(409, "account_mismatch", "The selected card is not in the Kripicard account assigned to this request.");
    }
    const cardResult = await db.query<{ id: string; provider_card_id: string; last4: string | null }>(
      `SELECT id,provider_card_id,last4 FROM cards
        WHERE id=$1::uuid AND account_id=$2::uuid AND provider_card_id IS NOT NULL AND archived_at IS NULL
        FOR UPDATE`,
      [args.cardId,args.accountId],
    );
    const card = cardResult.rows[0];
    if (!card) throw new ApiError(409, "card_not_available", "Sync the account and choose an active provider card from the assigned account.");
    const otherUser = await db.query<{ id: string }>(
      `SELECT id FROM telegram_users WHERE onboarding_card_id=$1::uuid AND id<>$2::uuid LIMIT 1`,
      [card.id,args.userId],
    );
    if (otherUser.rows[0]) throw new ApiError(409, "card_already_assigned", "This card is already the first card of another customer.");
    if (cardRequest.last_issue_operation_id) {
      await db.query(
        `UPDATE card_operations
            SET card_id=$2::uuid,status='succeeded',provider_status='issued_external',provider_ref=$3,
                provider_response_ref='attached_existing_card',safe_result=safe_result||$4::jsonb,updated_at=now()
          WHERE id=$1::uuid AND status IN ('created','pending','failed','needs_reconciliation')`,
        [cardRequest.last_issue_operation_id,card.id,card.provider_card_id,JSON.stringify({ safeToRetry: false, attachedExistingCard: true })],
      );
    }
    await db.query(
      `UPDATE card_requests
          SET status='issued',provider_card_id=$2,issued_at=COALESCE(issued_at,now()),updated_at=now()
        WHERE id=$1::uuid`,
      [cardRequest.id,card.provider_card_id],
    );
    await db.query(
      `UPDATE telegram_users
          SET payment_status='card_ready',onboarding_card_id=$2::uuid,updated_at=now()
        WHERE id=$1::uuid`,
      [args.userId,card.id],
    );
    if (cardRequest.status !== "issued") {
      await db.query(
        `INSERT INTO card_request_events(request_id,from_status,to_status,actor_type,admin_id,note,safe_metadata)
         VALUES($1::uuid,$2,'issued','admin',$3::uuid,'Existing Kripicard attached by administrator',$4::jsonb)`,
        [cardRequest.id,cardRequest.status,args.adminId,JSON.stringify({ accountId: args.accountId, cardId: card.id, providerCardId: card.provider_card_id })],
      );
    }
    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id)
       VALUES('admin',$1::uuid,'onboarding.existing_card.attached','telegram_user',$2,$3::jsonb,$4::inet,$5)`,
      [args.adminId,args.userId,JSON.stringify({ cardRequestId: cardRequest.id, accountId: args.accountId, cardId: card.id, providerCardId: card.provider_card_id }),args.ip ?? null,args.traceId],
    );
    return { cardId: card.id, cardLast4: card.last4 };
  });
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
