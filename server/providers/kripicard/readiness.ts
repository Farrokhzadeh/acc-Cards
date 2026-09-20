import { z } from "zod";
import { getPool, withTransaction } from "@/server/database/pool";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";

export const providerReadinessStatusSchema = z.enum(["confirmed", "partial", "unresolved", "not_applicable"]);
export const providerEvidenceSourceSchema = z.enum(["supplied_pdf", "provider_written", "live_test", "official_public", "none"]);
export type ProviderReadinessStatus = z.infer<typeof providerReadinessStatusSchema>;
export type ProviderEvidenceSource = z.infer<typeof providerEvidenceSourceSchema>;

export const providerReadinessUpdateSchema = z.object({
  status: providerReadinessStatusSchema,
  sourceKind: z.enum(["provider_written", "live_test", "official_public", "none"]),
  sourceReference: z.string().trim().min(3).max(500).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

type ReadinessRow = {
  key: string;
  category: string;
  label: string;
  requirement: string;
  status: ProviderReadinessStatus;
  source_kind: ProviderEvidenceSource;
  source_reference: string | null;
  safe_note: string | null;
  blocks_live_money: boolean;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  updated_at: Date;
};

function serialize(row: ReadinessRow) {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    requirement: row.requirement,
    status: row.status,
    sourceKind: row.source_kind,
    sourceReference: row.source_reference,
    note: row.safe_note,
    blocksLiveMoney: row.blocks_live_money,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function isCleared(row: ReadinessRow) {
  return row.status === "confirmed" || row.status === "not_applicable";
}

export async function getProviderReadiness() {
  const env = parseServerEnv(process.env);
  const result = await getPool().query<ReadinessRow>(
    `SELECT key,category,label,requirement,status,source_kind,source_reference,safe_note,
            blocks_live_money,confirmed_by,confirmed_at,updated_at
       FROM provider_readiness_checks
      ORDER BY blocks_live_money DESC, category, key`,
  );
  const blockers = result.rows.filter((row) => row.blocks_live_money && !isCleared(row));
  const confirmed = result.rows.filter((row) => isCleared(row));
  const checks = result.rows.map(serialize);
  const requiredByOperation = {
    card_create: ["wallet_flow", "card_minimum_documented", "production_rate_limits", "live_bin_catalogue", "purchase_202_contract"],
    card_fund: ["wallet_flow", "card_minimum_documented", "production_rate_limits", "production_fee_schedule", "purchase_202_contract"],
    deposit_create: ["wallet_flow", "deposit_order_id_idempotency", "deposit_instruction_fields", "deposit_status_model", "production_rate_limits", "deposit_underpayment_behavior", "deposit_overpayment_behavior", "deposit_late_payment_behavior"],
  } as const;
  const readyByOperation = Object.fromEntries(Object.entries(requiredByOperation).map(([operation, keys]) => {
    const operationBlockers = keys.filter((key) => {
      const row = result.rows.find((item) => item.key === key);
      return !row || !isCleared(row);
    });
    return [operation, { ready: operationBlockers.length === 0, blockers: operationBlockers }];
  }));
  return {
    providerProfile: "appapi_external",
    providerBaseUrl: env.KRIPICARD_BASE_URL,
    documentedPaymentModel: "wallet_based" as const,
    directCryptoToCardSupportedBySuppliedContract: false,
    readyForMoneyWrites: blockers.length === 0,
    readyByOperation,
    moneyWriteImplementationEnabled: env.ENABLE_LIVE_PROVIDER_WRITES,
    summary: {
      total: result.rows.length,
      confirmed: confirmed.length,
      blockers: blockers.length,
    },
    checks,
  };
}

export async function assertProviderMoneyReadiness(operation: "deposit_create" | "card_create" | "card_fund") {
  const snapshot = await getProviderReadiness();
  const operationState = snapshot.readyByOperation[operation] as { ready: boolean; blockers: string[] } | undefined;
  if (!operationState?.ready) {
    throw new ApiError(
      503,
      "provider_money_not_ready",
      `Kripicard ${operation} is blocked until its operation-specific provider readiness checks are cleared.`,
      { blockers: operationState?.blockers ?? ["readiness_definition_missing"] },
    );
  }
  return snapshot;
}

export async function updateProviderReadiness(input: {
  key: string;
  status: ProviderReadinessStatus;
  sourceKind: Exclude<ProviderEvidenceSource, "supplied_pdf">;
  sourceReference?: string | null;
  note?: string | null;
  session: AuthSession;
  request: Request;
  requestId: string;
}) {
  const sourceReference = input.sourceReference?.trim() || null;
  const note = input.note?.trim() || null;

  if ((input.status === "confirmed" || input.status === "not_applicable") && input.sourceKind === "none") {
    throw new ApiError(400, "provider_evidence_required", "Confirmed provider readiness requires written provider evidence or a documented live test.");
  }
  if ((input.status === "confirmed" || input.status === "not_applicable") && !sourceReference) {
    throw new ApiError(400, "provider_evidence_required", "Add a provider ticket, email, document, or live-test reference before clearing this check.");
  }

  const updated = await withTransaction(async (db) => {
    const currentResult = await db.query<ReadinessRow>(
      `SELECT key,category,label,requirement,status,source_kind,source_reference,safe_note,
              blocks_live_money,confirmed_by,confirmed_at,updated_at
         FROM provider_readiness_checks
        WHERE key=$1
        FOR UPDATE`,
      [input.key],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "provider_readiness_check_not_found", "Provider readiness check not found.");

    // Public marketing/docs can add context, but cannot clear a live-money blocker. The
    // exact appapi contract must be confirmed in writing by the provider or exercised in a controlled live/sandbox test.
    if (current.blocks_live_money && ["confirmed", "not_applicable"].includes(input.status) && input.sourceKind === "official_public") {
      throw new ApiError(400, "provider_evidence_insufficient", "Official public/marketing material cannot clear a live-money blocker for the appapi contract. Use provider-written confirmation or a controlled live test.");
    }

    const confirmed = input.status === "confirmed" || input.status === "not_applicable";
    const result = await db.query<ReadinessRow>(
      `UPDATE provider_readiness_checks
          SET status=$2,
              source_kind=$3,
              source_reference=$4,
              safe_note=$5,
              confirmed_by=CASE WHEN $6::boolean THEN $7::uuid ELSE NULL END,
              confirmed_at=CASE WHEN $6::boolean THEN now() ELSE NULL END,
              updated_at=now()
        WHERE key=$1
        RETURNING key,category,label,requirement,status,source_kind,source_reference,safe_note,
                  blocks_live_money,confirmed_by,confirmed_at,updated_at`,
      [input.key, input.status, input.sourceKind, sourceReference, note, confirmed, input.session.principal.id],
    );

    await db.query(
      `INSERT INTO provider_readiness_events(check_key,admin_id,from_status,to_status,source_kind,source_reference,safe_note)
       VALUES($1,$2::uuid,$3,$4,$5,$6,$7)`,
      [input.key, input.session.principal.id, current.status, input.status, input.sourceKind, sourceReference, note],
    );
    return result.rows[0]!;
  });

  await auditAdminEvent({
    adminId: input.session.principal.id,
    action: "provider.readiness.updated",
    entityType: "provider_readiness_check",
    entityId: null,
    request: input.request,
    requestId: input.requestId,
    metadata: {
      key: input.key,
      status: input.status,
      sourceKind: input.sourceKind,
      sourceReference: sourceReference ? sourceReference.slice(0, 160) : null,
    },
  });
  return serialize(updated);
}
