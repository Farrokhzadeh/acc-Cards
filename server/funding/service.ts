import { z } from "zod";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { createCustomerPaymentInTransaction, syncFundingPaymentStatus } from "@/server/payments/service";

export type FundingStatus = "pending_receipt" | "pending_review" | "correction_needed" | "accepted" | "funding" | "funding_failed" | "needs_reconciliation" | "completed" | "rejected" | "cancelled";

const REVIEWABLE = ["pending_review", "correction_needed"] as const;

const rowSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  user_id: z.string().uuid(),
  card_id: z.string().uuid(),
  card_amount_usd_cents: z.union([z.string(), z.bigint()]),
  provider_fee_usd_cents: z.union([z.string(), z.bigint()]),
  own_fee_usd_cents: z.union([z.string(), z.bigint()]),
  client_pays_usd_cents: z.union([z.string(), z.bigint()]),
  client_pays_rial: z.union([z.string(), z.bigint()]).nullable(),
  rate_id: z.string().uuid().nullable(),
  rate_rial_per_usd: z.union([z.string(), z.bigint()]).nullable(),
  provider_fee_basis_points: z.number().int(),
  provider_fee_fixed_usd_cents: z.union([z.string(), z.bigint()]),
  service_fee_basis_points: z.number().int(),
  quote_expires_at: z.coerce.date().nullable(),
  status: z.string(),
  admin_note: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  submitted_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
type FundingRow = z.infer<typeof rowSchema>;

async function setting<T>(db: DatabaseQueryable, key: string, fallback: T): Promise<T> {
  const result = await db.query<{ typed_value: T }>(`SELECT typed_value FROM settings WHERE key=$1`, [key]);
  return result.rows[0]?.typed_value ?? fallback;
}

function money(value: string | bigint | null) { return value == null ? null : String(value); }
function feeFor(amount: bigint, bps: number) { return (amount * BigInt(bps) + 5000n) / 10000n; }
function rialFor(cents: bigint, rialPerUsd: bigint) { return (cents * rialPerUsd + 50n) / 100n; }

export async function getFundingPolicy(db: DatabaseQueryable = getPool()) {
  const minimum = Math.max(1000, Number(await setting(db, "minimum_card_funding_usd_cents", 2000)) || 2000);
  const serviceBps = Math.max(0, Math.min(10000, Number(await setting(db, "funding_service_fee_basis_points", 250)) || 0));
  const providerBps = Math.max(0, Math.min(10000, Number(await setting(db, "funding_provider_fee_basis_points", 400)) || 0));
  const providerFixed = Math.max(0, Number(await setting(db, "funding_provider_fee_fixed_usd_cents", 100)) || 0);
  const quoteTtlMinutes = Math.max(5, Math.min(120, Number(await setting(db, "funding_quote_ttl_minutes", 30)) || 30));
  return { minimumUsdCents: minimum, serviceFeeBasisPoints: serviceBps, providerFeeBasisPoints: providerBps, providerFeeFixedUsdCents: providerFixed, quoteTtlMinutes };
}

async function activeRate(db: DatabaseQueryable, id?: string | null) {
  const result = await db.query<{ id: string; rial_per_usd: string | bigint; source: string; effective_at: Date; expires_at: Date }>(
    id
      ? `SELECT id,rial_per_usd,source,effective_at,expires_at FROM exchange_rates WHERE id=$1::uuid AND effective_at<=now() AND expires_at>now()`
      : `SELECT id,rial_per_usd,source,effective_at,expires_at FROM exchange_rates WHERE effective_at<=now() AND expires_at>now() ORDER BY effective_at DESC,created_at DESC LIMIT 1`,
    id ? [id] : [],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(503, "funding_rate_unavailable", "Funding requests are temporarily unavailable because no current approved Rial/USD rate is configured.");
  return row;
}

async function assertOwnedCard(db: DatabaseQueryable, userId: string, cardId: string) {
  const result = await db.query<{ id: string; last4: string | null; label: string | null; account_id: string; status: string }>(
    `SELECT c.id,c.last4,c.label,c.account_id,c.status
       FROM cards c JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
      WHERE taa.telegram_user_id=$1::uuid AND c.id=$2::uuid AND c.archived_at IS NULL
      LIMIT 1`, [userId, cardId],
  );
  const card = result.rows[0];
  if (!card) throw new ApiError(403, "card_not_owned", "That card is no longer available on your assigned account(s).");
  if (["closed","expired"].includes(card.status)) throw new ApiError(409, "card_not_fundable", "That card cannot receive a funding request in its current state.");
  return card;
}

export async function previewFundingQuote(userId: string, cardId: string, amountUsdCents: number) {
  const db = getPool();
  const card = await assertOwnedCard(db, userId, cardId);
  const policy = await getFundingPolicy(db);
  if (!Number.isInteger(amountUsdCents) || amountUsdCents < policy.minimumUsdCents) {
    throw new ApiError(400, "amount_below_minimum", `The minimum card funding request is $${(policy.minimumUsdCents / 100).toFixed(2)}.`);
  }
  const rate = await activeRate(db);
  const amount = BigInt(amountUsdCents);
  const providerFee = BigInt(policy.providerFeeFixedUsdCents) + feeFor(amount, policy.providerFeeBasisPoints);
  const serviceFee = feeFor(amount, policy.serviceFeeBasisPoints);
  const total = amount + providerFee + serviceFee;
  const expiresMs = Math.min(rate.expires_at.getTime(), Date.now() + policy.quoteTtlMinutes * 60_000);
  return {
    card: { id: card.id, last4: card.last4, label: card.label },
    amountUsdCents: String(amount),
    providerFeeUsdCents: String(providerFee),
    serviceFeeUsdCents: String(serviceFee),
    clientPaysUsdCents: String(total),
    rialPerUsd: String(rate.rial_per_usd),
    clientPaysRial: String(rialFor(total, BigInt(rate.rial_per_usd))),
    rateId: rate.id,
    rateSource: rate.source,
    minimumUsdCents: policy.minimumUsdCents,
    serviceFeeBasisPoints: policy.serviceFeeBasisPoints,
    providerFeeBasisPoints: policy.providerFeeBasisPoints,
    providerFeeFixedUsdCents: String(policy.providerFeeFixedUsdCents),
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

async function insertEvent(db: DatabaseQueryable, input: { requestId: string; fromStatus?: string | null; toStatus: FundingStatus; actorType: "admin"|"telegram_user"|"system"; adminId?: string|null; telegramUserId?: string|null; note?: string|null; metadata?: Record<string,unknown> }) {
  await db.query(
    `INSERT INTO funding_request_events(request_id,from_status,to_status,actor_type,actor_id,note,admin_id,telegram_user_id,safe_metadata)
     VALUES($1::uuid,$2,$3,$4,$5::uuid,$6,$7::uuid,$8::uuid,$9::jsonb)`,
    [input.requestId,input.fromStatus??null,input.toStatus,input.actorType,input.adminId??input.telegramUserId??null,input.note?.slice(0,1000)??null,input.adminId??null,input.telegramUserId??null,JSON.stringify(input.metadata??{})],
  );
}

async function queueStatus(db: DatabaseQueryable, requestId: string, status: FundingStatus) {
  await db.query(`INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,status,available_at)
                  VALUES('telegram','funding_request',$1::uuid,'funding_request.status_changed',$2::jsonb,'pending',now())`,
    [requestId,JSON.stringify({fundingRequestId:requestId,status})]);
}

function serialize(rowInput: FundingRow) {
  const row = rowSchema.parse(rowInput);
  return {
    id: row.id, reference: row.reference, userId: row.user_id, cardId: row.card_id,
    cardAmountUsdCents: money(row.card_amount_usd_cents)!, providerFeeUsdCents: money(row.provider_fee_usd_cents)!, ownFeeUsdCents: money(row.own_fee_usd_cents)!,
    clientPaysUsdCents: money(row.client_pays_usd_cents)!, clientPaysRial: money(row.client_pays_rial), rateId: row.rate_id, rateRialPerUsd: money(row.rate_rial_per_usd),
    providerFeeBasisPoints: row.provider_fee_basis_points, providerFeeFixedUsdCents: money(row.provider_fee_fixed_usd_cents)!, serviceFeeBasisPoints: row.service_fee_basis_points,
    quoteExpiresAt: row.quote_expires_at?.toISOString() ?? null, status: row.status as FundingStatus, adminNote: row.admin_note, reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null, submittedAt: row.submitted_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export type FundingQuoteInput = {
  rateId: string;
  rialPerUsd: string;
  minimumUsdCents: number;
  providerFeeBasisPoints: number;
  providerFeeFixedUsdCents: string;
  serviceFeeBasisPoints: number;
  expiresAt: string;
};

export async function createTelegramFundingRequest(input: { userId: string; cardId: string; amountUsdCents: number; quote: FundingQuoteInput }) {
  return withTransaction(async (db) => {
    const card = await assertOwnedCard(db,input.userId,input.cardId);
    const quoteExpiresAt = new Date(input.quote.expiresAt);
    if (!Number.isFinite(quoteExpiresAt.getTime()) || quoteExpiresAt.getTime() <= Date.now()) {
      throw new ApiError(409,"quote_expired","This funding quote expired. Start again to receive a current rate.");
    }
    if (!Number.isInteger(input.quote.minimumUsdCents) || input.quote.minimumUsdCents < 1000) throw new ApiError(400,"invalid_quote","The quote minimum is invalid.");
    if (!Number.isInteger(input.amountUsdCents) || input.amountUsdCents < input.quote.minimumUsdCents) throw new ApiError(400,"amount_below_minimum",`The minimum card funding request for this quote is $${(input.quote.minimumUsdCents/100).toFixed(2)}.`);
    if (!Number.isInteger(input.quote.providerFeeBasisPoints) || input.quote.providerFeeBasisPoints < 0 || input.quote.providerFeeBasisPoints > 10000) throw new ApiError(400,"invalid_quote","The provider fee snapshot is invalid.");
    if (!Number.isInteger(input.quote.serviceFeeBasisPoints) || input.quote.serviceFeeBasisPoints < 0 || input.quote.serviceFeeBasisPoints > 10000) throw new ApiError(400,"invalid_quote","The service fee snapshot is invalid.");
    if (!/^\d+$/.test(input.quote.providerFeeFixedUsdCents) || !/^\d+$/.test(input.quote.rialPerUsd)) throw new ApiError(400,"invalid_quote","The quote contains invalid integer values.");
    const rate = await activeRate(db,input.quote.rateId);
    if (String(rate.rial_per_usd) !== input.quote.rialPerUsd) throw new ApiError(409,"quote_mismatch","The exchange-rate snapshot no longer matches the approved rate record.");
    const amount = BigInt(input.amountUsdCents);
    const providerFixed = BigInt(input.quote.providerFeeFixedUsdCents);
    const providerFee = providerFixed + feeFor(amount,input.quote.providerFeeBasisPoints);
    const serviceFee = feeFor(amount,input.quote.serviceFeeBasisPoints);
    const total = amount + providerFee + serviceFee;
    const result = await db.query<FundingRow>(
      `INSERT INTO funding_requests(reference,user_id,card_id,card_amount_usd_cents,provider_fee_usd_cents,own_fee_usd_cents,client_pays_usd_cents,client_pays_rial,rate_id,rate_rial_per_usd,status,provider_fee_basis_points,provider_fee_fixed_usd_cents,service_fee_basis_points,quote_expires_at)
       VALUES('FR-'||nextval('funding_request_reference_seq')::text,$1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::uuid,$9,'pending_receipt',$10,$11,$12,$13)
       RETURNING *`,
      [input.userId,card.id,amount.toString(),providerFee.toString(),serviceFee.toString(),total.toString(),rialFor(total,BigInt(input.quote.rialPerUsd)).toString(),rate.id,input.quote.rialPerUsd,input.quote.providerFeeBasisPoints,input.quote.providerFeeFixedUsdCents,input.quote.serviceFeeBasisPoints,quoteExpiresAt],
    );
    const row=result.rows[0]!;
    await createCustomerPaymentInTransaction(db, {
      userId: input.userId,
      purpose: "card_funding",
      fundingRequestId: row.id,
      cardId: card.id,
      amountUsdCents: row.card_amount_usd_cents,
      providerFeeUsdCents: row.provider_fee_usd_cents,
      serviceFeeUsdCents: row.own_fee_usd_cents,
      rateId: row.rate_id,
      rateRialPerUsd: row.rate_rial_per_usd,
      customerPaysRial: row.client_pays_rial,
    });
    await insertEvent(db,{requestId:row.id,toStatus:"pending_receipt",actorType:"telegram_user",telegramUserId:input.userId,metadata:{reference:row.reference,cardId:card.id,last4:card.last4,quoteExpiresAt:input.quote.expiresAt}});
    await db.query(`INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted) VALUES('telegram_user',$1::uuid,'funding_request.created','funding_request',$2,$3::jsonb)`,[input.userId,row.id,JSON.stringify({reference:row.reference,cardId:card.id,amountUsdCents:String(row.card_amount_usd_cents),clientPaysRial:String(row.client_pays_rial),rateId:row.rate_id,providerFeeBasisPoints:row.provider_fee_basis_points,serviceFeeBasisPoints:row.service_fee_basis_points})]);
    return serialize(row);
  });
}

export async function markReceiptAttachedInTransaction(db: DatabaseQueryable, input: { requestId: string; userId: string; receiptId: string }) {
  const locked=await db.query<FundingRow>(`SELECT * FROM funding_requests WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE`,[input.requestId,input.userId]);
  const row=locked.rows[0]; if(!row) throw new ApiError(404,"not_found","Funding request not found.");
  if(!["pending_receipt","correction_needed"].includes(row.status)) throw new ApiError(409,"invalid_state","This request is not waiting for receipt evidence.");
  const receipt=await db.query<{scan_status:string}>(`SELECT scan_status FROM receipts WHERE id=$1::uuid AND request_id=$2::uuid`,[input.receiptId,row.id]);
  if(receipt.rows[0]?.scan_status!=="clean") throw new ApiError(409,"receipt_not_clean","Receipt validation has not completed successfully.");
  const updated=await db.query<FundingRow>(`UPDATE funding_requests SET status='pending_review',admin_note=NULL,updated_at=now() WHERE id=$1::uuid RETURNING *`,[row.id]);
  await db.query(
    `UPDATE customer_payments SET status='pending_review',receipt_id=$2::uuid,admin_note=NULL,updated_at=now()
      WHERE funding_request_id=$1::uuid`,
    [row.id,input.receiptId],
  );
  await insertEvent(db,{requestId:row.id,fromStatus:row.status,toStatus:"pending_review",actorType:"telegram_user",telegramUserId:input.userId,metadata:{receiptId:input.receiptId}});
  await queueStatus(db,row.id,"pending_review");
  return serialize(updated.rows[0]!);
}

export async function markReceiptAttached(input: { requestId: string; userId: string; receiptId: string }) {
  return withTransaction((db)=>markReceiptAttachedInTransaction(db,input));
}

export async function cancelTelegramFundingRequest(userId:string,requestId:string){
  return withTransaction(async(db)=>{
    const locked=await db.query<FundingRow>(`SELECT * FROM funding_requests WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE`,[requestId,userId]);
    const row=locked.rows[0]; if(!row) throw new ApiError(404,"not_found","Funding request not found.");
    if(!["pending_receipt","pending_review","correction_needed"].includes(row.status)) throw new ApiError(409,"invalid_state","This funding request can no longer be cancelled.");
    const updated=await db.query<FundingRow>(`UPDATE funding_requests SET status='cancelled',updated_at=now() WHERE id=$1::uuid RETURNING *`,[row.id]);
    await syncFundingPaymentStatus(db,row.id,"cancelled");
    await insertEvent(db,{requestId:row.id,fromStatus:row.status,toStatus:"cancelled",actorType:"telegram_user",telegramUserId:userId});
    await queueStatus(db,row.id,"cancelled");
    return serialize(updated.rows[0]!);
  });
}

async function decorate(db:DatabaseQueryable,row:FundingRow){
  const client=await db.query<{display_name:string|null;username:string|null;telegram_user_id:string|bigint}>(`SELECT display_name,username,telegram_user_id FROM telegram_users WHERE id=$1::uuid`,[row.user_id]);
  const card=await db.query<{last4:string|null;label:string|null;account_id:string}>(`SELECT last4,label,account_id FROM cards WHERE id=$1::uuid`,[row.card_id]);
  const receipt=await db.query<{id:string;original_filename:string|null;detected_mime_type:string|null;size_bytes:string|bigint;sha256_hex:string;scan_status:string;scan_engine:string|null;scan_note:string|null;created_at:Date}>(`SELECT id,original_filename,detected_mime_type,size_bytes,sha256_hex,scan_status,scan_engine,scan_note,created_at FROM receipts WHERE request_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,[row.id]);
  return {...serialize(row),client:client.rows[0]?{displayName:client.rows[0].display_name,username:client.rows[0].username,telegramUserId:String(client.rows[0].telegram_user_id)}:null,card:card.rows[0]?{last4:card.rows[0].last4,label:card.rows[0].label,accountId:card.rows[0].account_id}:null,receipt:receipt.rows[0]?{...receipt.rows[0],sizeBytes:String(receipt.rows[0].size_bytes),createdAt:receipt.rows[0].created_at.toISOString()}:null};
}

export async function listFundingRequests(args:{search?:string;status?:string|null;limit?:number;cursor?:string|null}){
  const limit=Math.max(1,Math.min(100,args.limit??50)); const search=(args.search??"").trim().slice(0,200);
  const values:unknown[]=[search]; const where=[`($1='' OR fr.reference ILIKE '%'||$1||'%' OR COALESCE(tu.display_name,'') ILIKE '%'||$1||'%' OR COALESCE(tu.username,'') ILIKE '%'||$1||'%' OR COALESCE(c.last4,'') ILIKE '%'||$1||'%')`];
  if(args.status){values.push(args.status);where.push(`fr.status=$${values.length}`);}
  if(args.cursor){
    try {
      const [submitted,id]=Buffer.from(args.cursor,"base64url").toString("utf8").split("|");
      if(!submitted||!id||!z.string().datetime().safeParse(submitted).success||!z.string().uuid().safeParse(id).success) throw new Error("invalid cursor");
      values.push(submitted,id); where.push(`(fr.submitted_at,fr.id) < ($${values.length-1}::timestamptz,$${values.length}::uuid)`);
    } catch { throw new ApiError(400,"validation_error","The pagination cursor is invalid."); }
  }
  values.push(limit+1);
  const result=await getPool().query<FundingRow>(`SELECT fr.* FROM funding_requests fr JOIN telegram_users tu ON tu.id=fr.user_id JOIN cards c ON c.id=fr.card_id WHERE ${where.join(" AND ")} ORDER BY fr.submitted_at DESC,fr.id DESC LIMIT $${values.length}`,values);
  const rows=result.rows.slice(0,limit);
  const last=rows.at(-1);
  return {
    items:await Promise.all(rows.map(row=>decorate(getPool(),row))),
    nextCursor:result.rows.length>limit&&last?Buffer.from(`${last.submitted_at.toISOString()}|${last.id}`,"utf8").toString("base64url"):null,
  };
}

export async function getFundingRequestDetail(id:string){
  const result=await getPool().query<FundingRow>(`SELECT * FROM funding_requests WHERE id=$1::uuid`,[id]); const row=result.rows[0]; if(!row) throw new ApiError(404,"not_found","Funding request not found.");
  const events=await getPool().query<{from_status:string|null;to_status:string;actor_type:string;note:string|null;safe_metadata:Record<string,unknown>;created_at:Date}>(`SELECT from_status,to_status,actor_type,note,safe_metadata,created_at FROM funding_request_events WHERE request_id=$1::uuid ORDER BY created_at ASC,id ASC`,[id]);
  return {...await decorate(getPool(),row),events:events.rows.map(e=>({fromStatus:e.from_status,toStatus:e.to_status,actorType:e.actor_type,note:e.note,metadata:e.safe_metadata,createdAt:e.created_at.toISOString()}))};
}

export async function reviewFundingRequest(args:{requestId:string;action:"accept"|"reject"|"correction";note?:string|null;adminId:string;requestIdHeader:string;ip?:string|null}){
  return withTransaction(async(db)=>{
    const locked=await db.query<FundingRow>(`SELECT * FROM funding_requests WHERE id=$1::uuid FOR UPDATE`,[args.requestId]); const row=locked.rows[0]; if(!row) throw new ApiError(404,"not_found","Funding request not found.");
    if(!REVIEWABLE.some((status) => status === row.status)) throw new ApiError(409,"invalid_state",`This request cannot be reviewed from status ${row.status}.`);
    const receipt=await db.query<{scan_status:string}>(`SELECT scan_status FROM receipts WHERE request_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,[row.id]);
    if(args.action==="accept" && receipt.rows[0]?.scan_status!=="clean") throw new ApiError(409,"receipt_not_clean","A validated receipt is required before accepting payment evidence.");
    const next:FundingStatus=args.action==="accept"?"accepted":args.action==="reject"?"rejected":"correction_needed";
    if (args.action === "correction") {
      await db.query(
        `UPDATE receipts SET scan_status='rejected',rejected_reason='correction_requested',scan_completed_at=COALESCE(scan_completed_at,now())
          WHERE id=(SELECT id FROM receipts WHERE request_id=$1::uuid AND scan_status='clean' ORDER BY created_at DESC LIMIT 1)`,
        [row.id],
      );
    }
    const updated=await db.query<FundingRow>(`UPDATE funding_requests SET status=$2,admin_note=$3,reviewed_by=$4::uuid,reviewed_at=now(),updated_at=now() WHERE id=$1::uuid RETURNING *`,[row.id,next,args.note?.trim().slice(0,1000)||null,args.adminId]);
    await syncFundingPaymentStatus(
      db,
      row.id,
      args.action === "accept" ? "accepted" : args.action === "correction" ? "correction_needed" : "rejected",
      { adminId: args.adminId, note: args.note ?? null },
    );
    await insertEvent(db,{requestId:row.id,fromStatus:row.status,toStatus:next,actorType:"admin",adminId:args.adminId,note:args.note??null});
    await db.query(`INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id) VALUES('admin',$1::uuid,$2,'funding_request',$3,$4::jsonb,$5::inet,$6)`,[args.adminId,`funding_request.${args.action}`,row.id,JSON.stringify({reference:row.reference,fromStatus:row.status,toStatus:next}),args.ip??null,args.requestIdHeader]);
    await queueStatus(db,row.id,next); return serialize(updated.rows[0]!);
  });
}

export async function getFundingSettings(db: DatabaseQueryable = getPool()){
  const policy=await getFundingPolicy(db);
  let rate:null|{id:string;rialPerUsd:string;source:string;effectiveAt:string;expiresAt:string}=null;
  try{const r=await activeRate(db); rate={id:r.id,rialPerUsd:String(r.rial_per_usd),source:r.source,effectiveAt:r.effective_at.toISOString(),expiresAt:r.expires_at.toISOString()};}catch(error){if(!(error instanceof ApiError&&error.code==="funding_rate_unavailable"))throw error;}
  return {...policy,rate};
}

export async function updateFundingSettings(input:{serviceFeeBasisPoints?:number;minimumUsdCents?:number;rialPerUsd?:number;rateValidMinutes?:number;adminId:string}){
  return withTransaction(async(db)=>{
    if(input.serviceFeeBasisPoints!==undefined){if(!Number.isInteger(input.serviceFeeBasisPoints)||input.serviceFeeBasisPoints<0||input.serviceFeeBasisPoints>5000)throw new ApiError(400,"invalid_service_fee","Service fee must be between 0 and 50%."); await db.query(`INSERT INTO settings(key,typed_value,updated_by) VALUES('funding_service_fee_basis_points',$1::jsonb,$2::uuid) ON CONFLICT(key) DO UPDATE SET typed_value=EXCLUDED.typed_value,version=settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,[JSON.stringify(input.serviceFeeBasisPoints),input.adminId]);}
    if(input.minimumUsdCents!==undefined){if(!Number.isInteger(input.minimumUsdCents)||input.minimumUsdCents<1000)throw new ApiError(400,"invalid_minimum","Funding minimum cannot be below the documented provider minimum of $10."); await db.query(`INSERT INTO settings(key,typed_value,updated_by) VALUES('minimum_card_funding_usd_cents',$1::jsonb,$2::uuid) ON CONFLICT(key) DO UPDATE SET typed_value=EXCLUDED.typed_value,version=settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,[JSON.stringify(input.minimumUsdCents),input.adminId]);}
    if(input.rialPerUsd!==undefined){if(!Number.isSafeInteger(input.rialPerUsd)||input.rialPerUsd<1)throw new ApiError(400,"invalid_exchange_rate","Rial per USD must be a positive integer."); const ttl=Math.max(5,Math.min(1440,input.rateValidMinutes??240)); await db.query(`INSERT INTO exchange_rates(rial_per_usd,source,fetched_at,effective_at,expires_at,approved_by) VALUES($1,'manual_admin',now(),now(),now()+($2::int*interval '1 minute'),$3::uuid)`,[input.rialPerUsd,ttl,input.adminId]);}
    await db.query(`INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted) VALUES('admin',$1::uuid,'funding.pricing.updated','configuration','funding',$2::jsonb)`,[input.adminId,JSON.stringify({serviceFeeBasisPoints:input.serviceFeeBasisPoints??null,minimumUsdCents:input.minimumUsdCents??null,rateUpdated:input.rialPerUsd!==undefined})]);
    return getFundingSettings(db);
  });
}

export async function getTelegramFundingRequest(userId:string,requestId:string){
  const result=await getPool().query<FundingRow>(`SELECT * FROM funding_requests WHERE id=$1::uuid AND user_id=$2::uuid`,[requestId,userId]);
  const row=result.rows[0]; if(!row) throw new ApiError(404,"not_found","Funding request not found.");
  const card=await getPool().query<{last4:string|null;label:string|null}>(`SELECT last4,label FROM cards WHERE id=$1::uuid`,[row.card_id]);
  const receipt=await getPool().query<{scan_status:string;original_filename:string|null}>(`SELECT scan_status,original_filename FROM receipts WHERE request_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,[row.id]);
  const events=await getPool().query<{to_status:string;note:string|null;created_at:Date}>(`SELECT to_status,note,created_at FROM funding_request_events WHERE request_id=$1::uuid ORDER BY created_at ASC,id ASC`,[row.id]);
  return {request:serialize(row),card:card.rows[0]??null,receipt:receipt.rows[0]??null,events:events.rows.map(e=>({status:e.to_status,note:e.note,createdAt:e.created_at.toISOString()}))};
}
