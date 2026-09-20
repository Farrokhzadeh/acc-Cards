import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import { encodeCursor, type PageCursor } from "@/server/http/cursor";

export type KycStatus = "pending" | "approved" | "rejected";

export type KycDocumentRef = {
  objectKey: string;
  mimeType: string;
  filename: string | null;
  sizeBytes: number;
  sha256Hex: string;
};

export type KycSubmission = {
  id: string;
  telegramUserId: string;
  fullName: string;
  dateOfBirth: string | null;
  country: string;
  nationalId: string;
  phone: string;
  hasDocument: boolean;
  documentMimeType: string | null;
  documentFilename: string | null;
  status: KycStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  createdAt: string;
  customer: {
    displayName: string | null;
    username: string | null;
    telegramUserId: string;
  };
};

type Row = {
  id: string;
  telegram_user_id: string;
  full_name: string;
  date_of_birth: Date | string | null;
  country: string;
  national_id: string;
  phone: string;
  document_object_key: string | null;
  document_mime_type: string | null;
  document_filename: string | null;
  status: KycStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  submitted_at: Date;
  created_at: Date;
  u_display_name: string | null;
  u_username: string | null;
  u_telegram_user_id: string | bigint;
};

const SELECT = `SELECT k.id, k.telegram_user_id, k.full_name, k.date_of_birth, k.country, k.national_id, k.phone,
       k.document_object_key, k.document_mime_type, k.document_filename, k.status, k.review_note,
       k.reviewed_by, k.reviewed_at, k.submitted_at, k.created_at,
       u.display_name AS u_display_name, u.username AS u_username, u.telegram_user_id AS u_telegram_user_id
  FROM kyc_submissions k
  JOIN telegram_users u ON u.id = k.telegram_user_id`;

function iso(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}

function dateOnly(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function serialize(row: Row): KycSubmission {
  return {
    id: row.id,
    telegramUserId: row.telegram_user_id,
    fullName: row.full_name,
    dateOfBirth: dateOnly(row.date_of_birth),
    country: row.country,
    nationalId: row.national_id,
    phone: row.phone,
    hasDocument: Boolean(row.document_object_key),
    documentMimeType: row.document_mime_type,
    documentFilename: row.document_filename,
    status: row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: iso(row.reviewed_at),
    submittedAt: iso(row.submitted_at) ?? new Date().toISOString(),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    customer: {
      displayName: row.u_display_name,
      username: row.u_username,
      telegramUserId:
        typeof row.u_telegram_user_id === "bigint"
          ? row.u_telegram_user_id.toString()
          : String(row.u_telegram_user_id),
    },
  };
}

// --- Bot side -------------------------------------------------------------

export async function getKycStatusForUser(userId: string): Promise<KycStatus | "none"> {
  const result = await getPool().query<{ status: KycStatus }>(
    `SELECT status FROM kyc_submissions
      WHERE telegram_user_id = $1::uuid
      ORDER BY (status = 'approved') DESC, submitted_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.status ?? "none";
}

export async function createKycSubmission(input: {
  telegramUserId: string;
  fullName: string;
  dateOfBirth: string | null;
  country: string;
  nationalId: string;
  phone: string;
  document: KycDocumentRef | null;
}): Promise<{ id: string }> {
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO kyc_submissions(
        telegram_user_id, full_name, date_of_birth, country, national_id, phone,
        document_object_key, document_mime_type, document_filename, document_size_bytes, document_sha256, status)
     VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     RETURNING id`,
    [
      input.telegramUserId,
      input.fullName,
      input.dateOfBirth,
      input.country,
      input.nationalId,
      input.phone,
      input.document?.objectKey ?? null,
      input.document?.mimeType ?? null,
      input.document?.filename ?? null,
      input.document?.sizeBytes ?? null,
      input.document?.sha256Hex ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(500, "kyc_insert_failed", "Could not store the KYC submission.");
  return { id: row.id };
}

// --- Admin side -----------------------------------------------------------

export async function listKycSubmissions(page: {
  limit: number;
  cursor?: PageCursor;
  search?: string;
  status?: string;
}): Promise<{ items: KycSubmission[]; nextCursor?: string }> {
  const values: unknown[] = [];
  const where: string[] = ["TRUE"];

  if (page.status && ["pending", "approved", "rejected"].includes(page.status)) {
    values.push(page.status);
    where.push(`k.status = $${values.length}`);
  }
  if (page.search) {
    values.push(`%${page.search}%`);
    const i = values.length;
    where.push(
      `(k.full_name ILIKE $${i} OR k.country ILIKE $${i} OR k.national_id ILIKE $${i} OR k.phone ILIKE $${i}
        OR COALESCE(u.display_name, '') ILIKE $${i} OR COALESCE(u.username, '') ILIKE $${i}
        OR u.telegram_user_id::text ILIKE $${i})`,
    );
  }
  if (page.cursor) {
    values.push(page.cursor.createdAt, page.cursor.id);
    const a = values.length - 1;
    const b = values.length;
    where.push(`(k.created_at, k.id) < ($${a}::timestamptz, $${b}::uuid)`);
  }

  values.push(page.limit + 1);
  const limitIndex = values.length;

  const result = await getPool().query<Row>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY k.created_at DESC, k.id DESC LIMIT $${limitIndex}`,
    values,
  );

  const rows = result.rows;
  let nextCursor: string | undefined;
  if (rows.length > page.limit) {
    const last = rows[page.limit - 1]!;
    nextCursor = encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id });
    rows.length = page.limit;
  }
  return { items: rows.map(serialize), nextCursor };
}

export async function getKycSubmission(id: string): Promise<KycSubmission | null> {
  const result = await getPool().query<Row>(`${SELECT} WHERE k.id = $1::uuid`, [id]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}

export async function getKycDocument(
  id: string,
): Promise<{ objectKey: string; mimeType: string | null; filename: string | null } | null> {
  const result = await getPool().query<{ object_key: string; mime_type: string | null; filename: string | null }>(
    `SELECT document_object_key AS object_key, document_mime_type AS mime_type, document_filename AS filename
       FROM kyc_submissions
      WHERE id = $1::uuid AND document_object_key IS NOT NULL`,
    [id],
  );
  const row = result.rows[0];
  return row ? { objectKey: row.object_key, mimeType: row.mime_type, filename: row.filename } : null;
}

export async function reviewKycSubmission(args: {
  id: string;
  decision: "approve" | "reject";
  note: string | null;
  adminId: string;
  request: Request;
  requestId: string;
}): Promise<{ ok: true; status: KycStatus }> {
  const status: KycStatus = args.decision === "approve" ? "approved" : "rejected";
  const result = await getPool().query<{ id: string; status: KycStatus }>(
    `UPDATE kyc_submissions
        SET status = $2, review_note = $3, reviewed_by = $4::uuid, reviewed_at = now(), updated_at = now()
      WHERE id = $1::uuid
      RETURNING id, status`,
    [args.id, status, args.note, args.adminId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "not_found", "KYC submission not found.");
  await auditAdminEvent({
    adminId: args.adminId,
    action: `kyc.${status}`,
    entityType: "kyc_submission",
    entityId: args.id,
    request: args.request,
    requestId: args.requestId,
    metadata: { decision: args.decision },
  });
  return { ok: true, status: row.status };
}
