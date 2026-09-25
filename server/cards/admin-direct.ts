import { withTransaction } from "@/server/database/pool";
import { assignAccountInTransaction } from "@/server/clients/assignments";
import { getCardRequestBins } from "@/server/card-requests/service";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { requestIp } from "@/server/auth/request-meta";

export async function prepareAdminDirectCard(args: {
  clientId: string;
  accountId: string;
  bin: string;
  amountUsdCents: number;
  nameOnCard: string;
  email: string;
  dateOfBirth?: string | null;
  session: AuthSession;
  request: Request;
  requestId: string;
}) {
  const created = await withTransaction(async (db) => {
    const client = await db.query<{ id: string }>(
      `SELECT id FROM telegram_users WHERE id=$1::uuid FOR UPDATE`,
      [args.clientId],
    );
    if (!client.rows[0]) throw new ApiError(404, "client_not_found", "Telegram client not found.");

    await assignAccountInTransaction(db, {
      clientId: args.clientId,
      accountId: args.accountId,
      adminId: args.session.principal.id,
      requestId: args.requestId,
      ip: requestIp(args.request),
    });

    const bins = await getCardRequestBins(db);
    const configuredBin = bins.find((item) => item.bin === args.bin);
    if (!configuredBin) throw new ApiError(409, "unsupported_bin", "Select a BIN from the verified Kripicard catalogue.");
    if (configuredBin.requiresDob && !args.dateOfBirth) {
      throw new ApiError(400, "date_of_birth_required", "This BIN requires a date of birth.");
    }

    const result = await db.query<{ id: string; reference: string }>(
      `INSERT INTO card_requests(
         reference,user_id,selected_account_id,bin,initial_amount_usd_cents,name_on_card,email,date_of_birth,
         status,admin_note,reviewed_by,origin
       )
       VALUES(
         'ADM-' || lpad(nextval('card_request_reference_seq')::text,6,'0'),
         $1::uuid,$2::uuid,$3,$4,$5,$6,$7::date,
         'approved','Created directly by administrator',$8::uuid,'admin_direct'
       )
       RETURNING id,reference`,
      [
        args.clientId,
        args.accountId,
        args.bin,
        args.amountUsdCents,
        args.nameOnCard.trim(),
        args.email.trim().toLowerCase(),
        args.dateOfBirth || null,
        args.session.principal.id,
      ],
    );
    const row = result.rows[0]!;

    await db.query(
      `INSERT INTO card_request_events(request_id,from_status,to_status,actor_type,admin_id,note,safe_metadata)
       VALUES($1::uuid,NULL,'approved','admin',$2::uuid,'Direct admin card creation', $3::jsonb)`,
      [
        row.id,
        args.session.principal.id,
        JSON.stringify({
          origin: "admin_direct",
          accountId: args.accountId,
          bin: args.bin,
          amountUsdCents: String(args.amountUsdCents),
        }),
      ],
    );

    return row;
  });

  await auditAdminEvent({
    adminId: args.session.principal.id,
    action: "card.admin_direct.prepared",
    entityType: "card_request",
    entityId: created.id,
    request: args.request,
    requestId: args.requestId,
    metadata: {
      reference: created.reference,
      clientId: args.clientId,
      accountId: args.accountId,
      bin: args.bin,
      amountUsdCents: String(args.amountUsdCents),
    },
  });

  return created;
}
