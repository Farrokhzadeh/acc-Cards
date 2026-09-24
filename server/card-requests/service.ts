import { z } from "zod";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { assignAccountInTransaction, listAssignableAccounts } from "@/server/clients/assignments";
import { assertAcceptedPaymentForCardRequest, createCustomerPaymentInTransaction, getPaymentForCardRequest } from "@/server/payments/service";

const OPEN_STATUSES = ["pending_review", "approved", "correction_needed", "issuing", "issue_failed", "needs_reconciliation"] as const;
const REVIEWABLE_STATUSES = ["pending_review", "correction_needed"] as const;

export type CardRequestStatus =
  | "pending_review" | "approved" | "correction_needed" | "issuing" | "issue_failed"
  | "needs_reconciliation" | "issued" | "rejected" | "cancelled";

export type CardRequestBin = { bin: string; requiresDob: boolean };

type RequestRow = {
  id: string;
  reference: string;
  user_id: string;
  preferred_account_id: string | null;
  selected_account_id: string | null;
  bin: string;
  initial_amount_usd_cents: string | bigint;
  name_on_card: string;
  email: string;
  date_of_birth: string | Date | null;
  status: CardRequestStatus;
  admin_note: string | null;
  provider_card_id: string | null;
  reviewed_by: string | null;
  created_at: Date;
  updated_at: Date;
  issuance_started_at?: Date | null;
  issued_at?: Date | null;
  last_issue_operation_id?: string | null;
};

export const telegramDraftSchema = z.object({
  amountUsdCents: z.number().int().positive(),
  email: z.string().trim().email().max(320),
});

async function latestApprovedKyc(db: DatabaseQueryable, userId: string) {
  const result = await db.query<{ full_name: string; date_of_birth: string | Date | null }>(
    `SELECT full_name,date_of_birth
       FROM kyc_submissions
      WHERE telegram_user_id=$1::uuid AND status='approved'
      ORDER BY reviewed_at DESC NULLS LAST, submitted_at DESC, id DESC
      LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(403, "kyc_required", "Identity verification must be approved before requesting another card.");
  return row;
}

async function setting<T>(db: DatabaseQueryable, key: string, fallback: T): Promise<T> {
  const result = await db.query<{ typed_value: T }>(`SELECT typed_value FROM settings WHERE key=$1`, [key]);
  return result.rows[0]?.typed_value ?? fallback;
}

export async function getCardRequestBins(db: DatabaseQueryable = getPool()): Promise<CardRequestBin[]> {
  const raw = await setting<unknown[]>(db, "card_request_bins", []);
  const schema = z.array(z.object({ bin: z.string().regex(/^\d{6}$/), requiresDob: z.boolean() })).max(50);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function getCardRequestPolicy(db: DatabaseQueryable = getPool()) {
  const minimumRaw = await setting<number>(db, "minimum_card_creation_usd_cents", 2000);
  return {
    minimumUsdCents: Math.max(1000, Number(minimumRaw) || 2000),
  };
}

async function lockUserRequestCapacity(db: DatabaseQueryable, userId: string) {
  const user = await db.query<{ id: string }>(`SELECT id FROM telegram_users WHERE id=$1::uuid FOR UPDATE`, [userId]);
  if (!user.rows[0]) throw new ApiError(404, "client_not_found", "Telegram client not found.");
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('card-request-capacity:' || $1))`, [userId]);
}

async function capacitySnapshot(db: DatabaseQueryable, userId: string, excludeRequestId?: string | null) {
  const policy = await getCardRequestPolicy(db);
  const result = await db.query<{ active_cards: number; open_requests: number; assigned_accounts: number }>(
    `SELECT
       (SELECT COUNT(*)::int
          FROM cards c
          JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
         WHERE taa.telegram_user_id=$1::uuid
           AND c.archived_at IS NULL
           AND c.status NOT IN ('closed','expired')) AS active_cards,
       (SELECT COUNT(*)::int
          FROM card_requests cr
         WHERE cr.user_id=$1::uuid
           AND cr.status = ANY($2::text[])
           AND ($3::uuid IS NULL OR cr.id <> $3::uuid)) AS open_requests,
       (SELECT COUNT(*)::int FROM telegram_account_assignments taa WHERE taa.telegram_user_id=$1::uuid) AS assigned_accounts`,
    [userId, [...OPEN_STATUSES], excludeRequestId ?? null],
  );
  const row = result.rows[0] ?? { active_cards: 0, open_requests: 0, assigned_accounts: 0 };
  return { ...policy, ...row, usedSlots: row.active_cards + row.open_requests };
}

export async function getTelegramCardRequestCapacity(userId: string) {
  return capacitySnapshot(getPool(), userId);
}

async function insertEvent(db: DatabaseQueryable, args: {
  requestId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorType: "telegram_user" | "admin" | "system";
  adminId?: string | null;
  telegramUserId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO card_request_events(request_id, from_status, to_status, actor_type, admin_id, telegram_user_id, note, safe_metadata)
     VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8::jsonb)`,
    [args.requestId, args.fromStatus ?? null, args.toStatus, args.actorType, args.adminId ?? null, args.telegramUserId ?? null, args.note?.slice(0, 1000) ?? null, JSON.stringify(args.metadata ?? {})],
  );
}

async function queueStatusNotification(db: DatabaseQueryable, requestId: string, status: CardRequestStatus) {
  await db.query(
    `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, status, available_at)
     VALUES ('telegram','card_request',$1::uuid,'card_request.status_changed',$2::jsonb,'pending',now())`,
    [requestId, JSON.stringify({ cardRequestId: requestId, status })],
  );
}

function normalizeDob(value: string | Date | null) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function serialize(row: RequestRow) {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    preferredAccountId: row.preferred_account_id,
    selectedAccountId: row.selected_account_id,
    bin: row.bin,
    initialAmountUsdCents: String(row.initial_amount_usd_cents),
    nameOnCard: row.name_on_card,
    email: row.email,
    dateOfBirth: normalizeDob(row.date_of_birth),
    status: row.status,
    adminNote: row.admin_note,
    providerCardId: row.provider_card_id,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    issuanceStartedAt: row.issuance_started_at?.toISOString() ?? null,
    issuedAt: row.issued_at?.toISOString() ?? null,
    lastIssueOperationId: row.last_issue_operation_id ?? null,
  };
}

export async function createTelegramCardRequest(userId: string, draftInput: z.infer<typeof telegramDraftSchema>) {
  const draft = telegramDraftSchema.parse(draftInput);
  return withTransaction(async (db) => {
    await lockUserRequestCapacity(db, userId);
    const [profile, bins, capacity] = await Promise.all([
      latestApprovedKyc(db, userId),
      getCardRequestBins(db),
      capacitySnapshot(db, userId),
    ]);
    const placeholderBin = bins[0]?.bin;
    if (!placeholderBin) throw new ApiError(409, "card_bin_unconfigured", "Card issuance is not configured yet. Contact support.");
    if (draft.amountUsdCents < capacity.minimumUsdCents) {
      throw new ApiError(400, "amount_below_minimum", `The minimum initial card amount is ${(capacity.minimumUsdCents / 100).toFixed(2)}.`);
    }
    const result = await db.query<RequestRow>(
      `INSERT INTO card_requests(reference,user_id,bin,initial_amount_usd_cents,name_on_card,email,date_of_birth,status)
       VALUES ('CR-' || nextval('card_request_reference_seq')::text,$1::uuid,$2,$3,$4,$5,$6::date,'pending_review')
       RETURNING *`,
      [userId, placeholderBin, draft.amountUsdCents, profile.full_name, draft.email, normalizeDob(profile.date_of_birth)],
    );
    const row = result.rows[0]!;
    const payment = await createCustomerPaymentInTransaction(db, {
      userId,
      purpose: "additional_card",
      cardRequestId: row.id,
      amountUsdCents: row.initial_amount_usd_cents,
    });
    await insertEvent(db, { requestId: row.id, toStatus: row.status, actorType: "telegram_user", telegramUserId: userId, metadata: { reference: row.reference, paymentId: payment.id } });
    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted)
       VALUES ('telegram_user',$1::uuid,'card_request.submitted','card_request',$2,$3::jsonb)`,
      [userId, row.id, JSON.stringify({ reference: row.reference, initialAmountUsdCents: String(row.initial_amount_usd_cents) })],
    );
    return { request: serialize(row), payment, capacity: { ...capacity, usedSlots: capacity.usedSlots + 1 } };
  });
}

async function eligibleAccounts(_db: DatabaseQueryable, userId: string) {
  return listAssignableAccounts(userId, "", 100);
}

export async function listCardRequests(args: { search?: string; status?: string | null; limit?: number; cursor?: string | null }) {
  const limit = Math.max(1, Math.min(100, args.limit ?? 50));
  const search = (args.search ?? "").trim().slice(0, 200);
  const values: unknown[] = [search];
  const where: string[] = [`($1='' OR cr.reference ILIKE '%'||$1||'%' OR cr.name_on_card ILIKE '%'||$1||'%' OR cr.email ILIKE '%'||$1||'%' OR cr.bin ILIKE '%'||$1||'%' OR COALESCE(tu.display_name,'') ILIKE '%'||$1||'%' OR COALESCE(tu.username,'') ILIKE '%'||$1||'%')`];
  if (args.status) { values.push(args.status); where.push(`cr.status=$${values.length}`); }
  if (args.cursor) {
    const [created, id] = Buffer.from(args.cursor, "base64url").toString("utf8").split("|");
    if (created && id && z.string().datetime().safeParse(created).success && z.string().uuid().safeParse(id).success) {
      values.push(created, id);
      where.push(`(cr.created_at,cr.id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    }
  }
  values.push(limit + 1);
  const result = await getPool().query<RequestRow & { display_name: string | null; username: string | null; telegram_user_id: string | bigint }>(
    `SELECT cr.*,tu.display_name,tu.username,tu.telegram_user_id
       FROM card_requests cr JOIN telegram_users tu ON tu.id=cr.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY cr.created_at DESC,cr.id DESC LIMIT $${values.length}`,
    values,
  );
  const rows = result.rows.slice(0, limit);
  const availableBins = await getCardRequestBins();
  const items = await Promise.all(rows.map(async (row) => ({
    ...serialize(row),
    client: { id: row.user_id, displayName: row.display_name, username: row.username, telegramUserId: String(row.telegram_user_id) },
    eligibleAccounts: await eligibleAccounts(getPool(), row.user_id),
    availableBins,
    payment: await getPaymentForCardRequest(row.id),
  })));
  const last = rows.at(-1);
  return {
    items,
    nextCursor: result.rows.length > limit && last ? Buffer.from(`${last.created_at.toISOString()}|${last.id}`, "utf8").toString("base64url") : null,
  };
}

export async function getCardRequestDetail(requestId: string) {
  const result = await getPool().query<RequestRow & { display_name: string | null; username: string | null; telegram_user_id: string | bigint }>(
    `SELECT cr.*,tu.display_name,tu.username,tu.telegram_user_id FROM card_requests cr JOIN telegram_users tu ON tu.id=cr.user_id WHERE cr.id=$1::uuid`,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Card request not found.");
  const events = await getPool().query<{ id: string; from_status: string | null; to_status: string; actor_type: string; note: string | null; safe_metadata: Record<string,unknown>; created_at: Date }>(
    `SELECT id,from_status,to_status,actor_type,note,safe_metadata,created_at FROM card_request_events WHERE request_id=$1::uuid ORDER BY created_at ASC,id ASC`,
    [requestId],
  );
  return {
    ...serialize(row),
    client: { id: row.user_id, displayName: row.display_name, username: row.username, telegramUserId: String(row.telegram_user_id) },
    eligibleAccounts: await eligibleAccounts(getPool(), row.user_id),
    availableBins: await getCardRequestBins(),
    payment: await getPaymentForCardRequest(row.id),
    events: events.rows.map((event) => ({ id: event.id, fromStatus: event.from_status, toStatus: event.to_status, actorType: event.actor_type, note: event.note, metadata: event.safe_metadata, createdAt: event.created_at.toISOString() })),
  };
}

export async function reviewCardRequest(args: {
  requestId: string;
  action: "approve" | "reject";
  selectedAccountId?: string | null;
  selectedBin?: string | null;
  note?: string | null;
  adminId: string;
  requestIdHeader: string;
  ip?: string | null;
}) {
  return withTransaction(async (db) => {
    const locked = await db.query<RequestRow>(`SELECT * FROM card_requests WHERE id=$1::uuid FOR UPDATE`, [args.requestId]);
    const row = locked.rows[0];
    if (!row) throw new ApiError(404, "not_found", "Card request not found.");
    if (![...REVIEWABLE_STATUSES, "approved"].some((status) => status === row.status)) throw new ApiError(409, "invalid_state", `This request cannot be reviewed from status ${row.status}.`);
    await lockUserRequestCapacity(db, row.user_id);

    let nextStatus: CardRequestStatus;
    let selectedAccountId: string | null = row.selected_account_id;
    if (args.action === "approve") {
      if (![...REVIEWABLE_STATUSES].some((status) => status === row.status)) throw new ApiError(409, "already_approved", "This request is already approved.");
      await assertAcceptedPaymentForCardRequest(db, row.id);
      if (!args.selectedAccountId) throw new ApiError(400, "account_required", "Select the internal Kripicard account that should issue this card.");
      if (!args.selectedBin) throw new ApiError(400, "bin_required", "Select the card BIN for this request.");
      const bins = await getCardRequestBins(db);
      const selectedBin = bins.find((item) => item.bin === args.selectedBin);
      if (!selectedBin) throw new ApiError(400, "unsupported_bin", "That BIN is not enabled for card issuance.");
      if (selectedBin.requiresDob && !row.date_of_birth) throw new ApiError(409, "date_of_birth_required", "The selected BIN requires a date of birth, but this customer's approved KYC does not contain one.");
      await assignAccountInTransaction(db, {
        clientId: row.user_id,
        accountId: args.selectedAccountId,
        adminId: args.adminId,
        requestId: args.requestIdHeader,
        ip: args.ip,
      });
      selectedAccountId = args.selectedAccountId;
      row.bin = selectedBin.bin;
      nextStatus = "approved";
    } else {
      if (row.status === "issued") throw new ApiError(409, "invalid_state", "An issued request cannot be rejected.");
      nextStatus = "rejected";
    }

    const updated = await db.query<RequestRow>(
      `UPDATE card_requests SET status=$2,selected_account_id=$3::uuid,admin_note=$4,reviewed_by=$5::uuid,bin=$6,updated_at=now()
        WHERE id=$1::uuid RETURNING *`,
      [row.id, nextStatus, selectedAccountId, args.note?.trim().slice(0, 1000) || null, args.adminId, row.bin],
    );
    await insertEvent(db, { requestId: row.id, fromStatus: row.status, toStatus: nextStatus, actorType: "admin", adminId: args.adminId, note: args.note ?? null, metadata: { selectedAccountId, selectedBin: row.bin } });
    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id)
       VALUES ('admin',$1::uuid,$2,'card_request',$3,$4::jsonb,$5::inet,$6)`,
      [args.adminId, `card_request.${args.action}`, row.id, JSON.stringify({ reference: row.reference, fromStatus: row.status, toStatus: nextStatus, selectedAccountId, selectedBin: row.bin }), args.ip ?? null, args.requestIdHeader],
    );
    await queueStatusNotification(db, row.id, nextStatus);
    return serialize(updated.rows[0]!);
  });
}

export async function cancelTelegramCardRequest(userId: string, requestId: string) {
  return withTransaction(async (db) => {
    await lockUserRequestCapacity(db, userId);
    const result = await db.query<RequestRow>(`SELECT * FROM card_requests WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE`, [requestId, userId]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "not_found", "Card request not found.");
    if (!["pending_review", "correction_needed"].includes(row.status)) throw new ApiError(409, "invalid_state", "This request can no longer be cancelled from Telegram.");
    const payment = await db.query<{ status: string }>(`SELECT status FROM customer_payments WHERE card_request_id=$1::uuid FOR UPDATE`, [row.id]);
    if (payment.rows[0]?.status === "accepted" || payment.rows[0]?.status === "completed") {
      throw new ApiError(409, "payment_already_accepted", "This payment was already accepted. Contact support before cancelling the card request.");
    }
    await db.query(`UPDATE customer_payments SET status='cancelled',updated_at=now() WHERE card_request_id=$1::uuid AND status NOT IN ('completed','accepted')`, [row.id]);
    const updated = await db.query<RequestRow>(`UPDATE card_requests SET status='cancelled',updated_at=now() WHERE id=$1::uuid RETURNING *`, [row.id]);
    await insertEvent(db, { requestId: row.id, fromStatus: row.status, toStatus: "cancelled", actorType: "telegram_user", telegramUserId: userId });
    await db.query(`INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted) VALUES ('telegram_user',$1::uuid,'card_request.cancelled','card_request',$2,$3::jsonb)`, [userId,row.id,JSON.stringify({reference:row.reference})]);
    return serialize(updated.rows[0]!);
  });
}

export async function getTelegramCardRequest(userId: string, requestId: string) {
  const result = await getPool().query<RequestRow>(`SELECT * FROM card_requests WHERE id=$1::uuid AND user_id=$2::uuid`, [requestId,userId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404,"not_found","Card request not found.");
  const events = await getPool().query<{to_status:string;note:string|null;created_at:Date}>(`SELECT to_status,note,created_at FROM card_request_events WHERE request_id=$1::uuid ORDER BY created_at ASC,id ASC`,[requestId]);
  return { request: serialize(row), payment: await getPaymentForCardRequest(row.id), events: events.rows.map((e)=>({status:e.to_status,note:e.note,createdAt:e.created_at.toISOString()})) };
}
