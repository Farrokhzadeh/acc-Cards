import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { runtimeControlEnabled } from "@/server/operations/controls";
import { KripicardClient } from "@/server/providers/kripicard/client";
import { KripicardError } from "@/server/providers/kripicard/errors";
import { assertProviderMoneyReadiness } from "@/server/providers/kripicard/readiness";
import { decryptSecret } from "@/server/security/crypto";

export const createDepositInput = z.object({
  amountUsd: z.number().finite().min(1).max(100000),
  currency: z.string().trim().min(2).max(16),
  network: z.string().trim().min(1).max(32),
});

type DepositRow = {
  id: string;
  account_id: string;
  provider_deposit_id: string;
  order_id: string;
  status: "pending" | "completed" | "failed";
  amount_usd_cents: string | bigint;
  fee_usd_cents: string | bigint;
  expected_credit_usd_cents: string | bigint;
  credited_usd_cents: string | bigint | null;
  currency: string;
  network: string;
  pay_address: string;
  pay_amount: string;
  expires_at: Date;
  created_at: Date;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(502, "provider_error", "Kripicard returned an invalid monetary value.");
  return BigInt(Math.round(value * 100));
}

function serialize(row: DepositRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    providerDepositId: row.provider_deposit_id,
    orderId: row.order_id,
    status: row.status,
    amountUsdCents: String(row.amount_usd_cents),
    feeUsdCents: String(row.fee_usd_cents),
    expectedCreditUsdCents: String(row.expected_credit_usd_cents),
    creditedUsdCents: row.credited_usd_cents == null ? null : String(row.credited_usd_cents),
    currency: row.currency,
    network: row.network,
    payAddress: row.pay_address,
    payAmount: row.pay_amount,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function providerError(error: unknown) {
  if (!(error instanceof KripicardError)) return new ApiError(502, "provider_error", "Kripicard request failed.");
  if (error.kind === "timeout") return new ApiError(504, "provider_timeout", error.message);
  if (error.kind === "rate_limited") return new ApiError(503, "provider_rate_limited", error.message);
  if (error.kind === "provider_rejected") return new ApiError(422, "provider_rejected", error.message);
  return new ApiError(502, error.kind === "invalid_response" ? "provider_invalid_response" : "provider_error", error.message);
}

async function clientForAccount(accountId: string) {
  const result = await getPool().query<{ encrypted_api_key: string; status: string }>(
    `SELECT encrypted_api_key,status FROM kripi_accounts WHERE id=$1::uuid AND archived_at IS NULL`,
    [accountId],
  );
  const account = result.rows[0];
  if (!account) throw new ApiError(404, "not_found", "Kripicard account not found.");
  if (["disabled", "archived"].includes(account.status)) throw new ApiError(409, "account_unavailable", "This Kripicard account is unavailable.");
  if (!account.encrypted_api_key.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "Update this account with a valid Kripicard API key first.");
  return new KripicardClient({ apiKey: decryptSecret(account.encrypted_api_key) });
}

export async function getDepositOptions(accountId: string, currency?: string) {
  const client = await clientForAccount(accountId);
  try {
    if (currency) return { networks: (await client.depositNetworks({ currency })).data.networks };
    return { coins: (await client.depositCoins()).data };
  } catch (error) {
    throw providerError(error);
  }
}

export async function listAccountDeposits(accountId: string) {
  const result = await getPool().query<DepositRow>(
    `SELECT id,account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
            expected_credit_usd_cents,credited_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_at
       FROM kripicard_deposits WHERE account_id=$1::uuid ORDER BY created_at DESC LIMIT 20`,
    [accountId],
  );
  return { items: result.rows.map(serialize) };
}

export async function createAccountDeposit(input: { accountId: string; amountUsd: number; currency: string; network: string; session: AuthSession; request: Request; requestId: string }) {
  const env = parseServerEnv(process.env);
  if (!env.ENABLE_LIVE_PROVIDER_WRITES) throw new ApiError(503, "feature_disabled", "Kripicard crypto deposits are disabled by deployment configuration.");
  if (!await runtimeControlEnabled("provider_writes")) throw new ApiError(503, "runtime_kill_switch", "Kripicard provider writes are disabled in Operations.");
  await assertProviderMoneyReadiness("deposit_create");
  const client = await clientForAccount(input.accountId);
  const orderId = `accabad-${randomUUID()}`;
  let response;
  try {
    response = await client.createDeposit({ amount: input.amountUsd, currency: input.currency, network: input.network, orderId });
  } catch (error) {
    throw providerError(error);
  }
  const data = response.data;
  const result = await getPool().query<DepositRow>(
    `INSERT INTO kripicard_deposits(account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
       expected_credit_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_by)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid)
     RETURNING id,account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
       expected_credit_usd_cents,credited_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_at`,
    [input.accountId, data.id, orderId, data.status, cents(data.amount_usd), cents(data.fee_usd), cents(data.credited_on_completion_usd), data.pay_currency, data.network, data.pay_address, data.pay_amount, data.expires_at, input.session.principal.id],
  );
  await auditAdminEvent({ adminId: input.session.principal.id, action: "account.crypto_deposit.created", entityType: "kripi_account", entityId: input.accountId, request: input.request, requestId: input.requestId, metadata: { depositId: data.id, amountUsd: data.amount_usd, currency: data.pay_currency, network: data.network } });
  return serialize(result.rows[0]!);
}

export async function refreshAccountDeposit(input: { accountId: string; depositId: string; session: AuthSession; request: Request; requestId: string }) {
  const existing = await getPool().query<DepositRow>(
    `SELECT id,account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
            expected_credit_usd_cents,credited_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_at
       FROM kripicard_deposits WHERE id=$1::uuid AND account_id=$2::uuid`,
    [input.depositId, input.accountId],
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Crypto deposit not found.");
  const client = await clientForAccount(input.accountId);
  let response;
  try {
    response = await client.depositStatus({ id: row.provider_deposit_id });
  } catch (error) {
    throw providerError(error);
  }
  const data = response.data;
  const updated = await withTransaction(async (db) => {
    const locked = await db.query<DepositRow & { credited_applied: boolean }>(
      `SELECT id,account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
              expected_credit_usd_cents,credited_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_at,credited_applied
         FROM kripicard_deposits WHERE id=$1::uuid FOR UPDATE`,
      [row.id],
    );
    const current = locked.rows[0]!;
    const credited = data.status === "completed" && data.credited === true ? cents(data.credited_amount_usd ?? 0) : null;
    const shouldApply = credited != null && !current.credited_applied;
    const result = await db.query<DepositRow>(
      `UPDATE kripicard_deposits SET status=$2,credited_usd_cents=$3,
              credited_applied=credited_applied OR $4::boolean,updated_at=now()
        WHERE id=$1::uuid
        RETURNING id,account_id,provider_deposit_id,order_id,status,amount_usd_cents,fee_usd_cents,
          expected_credit_usd_cents,credited_usd_cents,currency,network,pay_address,pay_amount,expires_at,created_at`,
      [row.id, data.status, credited, shouldApply],
    );
    if (shouldApply) {
      await db.query(
        `UPDATE kripi_accounts SET account_balance_usd_cents=CASE
             WHEN account_balance_source='derived' THEN COALESCE(account_balance_usd_cents,0)+$2::bigint
             ELSE $2::bigint END,
           account_balance_source='derived',account_balance_as_of=now(),updated_at=now()
         WHERE id=$1::uuid`,
        [input.accountId, credited],
      );
    }
    return result.rows[0]!;
  });
  await auditAdminEvent({ adminId: input.session.principal.id, action: "account.crypto_deposit.refreshed", entityType: "kripi_account", entityId: input.accountId, request: input.request, requestId: input.requestId, metadata: { depositId: row.provider_deposit_id, status: data.status, credited: data.credited === true } });
  return serialize(updated);
}
