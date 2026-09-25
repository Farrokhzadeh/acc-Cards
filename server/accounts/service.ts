import { z } from "zod";
import { withTransaction, getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { encryptSecret, decryptSecret } from "@/server/security/crypto";
import { auditAdminEvent } from "@/server/auth/service";
import { requestIp } from "@/server/auth/request-meta";
import type { AuthSession } from "@/server/auth/types";

const emailProviderSchema = z.enum(["outlook", "gmail"]);
const emailAddressSchema = z.string().trim().email().max(320);

function optionalMailbox(value: unknown) {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function nullableMailbox(value: unknown) {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function validateProviderMailbox(value: { emailProvider?: "outlook" | "gmail"; emailAddress?: string | null }, ctx: z.RefinementCtx) {
  if (!value.emailProvider || !value.emailAddress) return;
  const domain = value.emailAddress.trim().toLowerCase().split("@").at(-1) ?? "";
  if (value.emailProvider === "gmail" && domain !== "gmail.com") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["emailAddress"], message: "Gmail connections must use an @gmail.com address." });
  }
  if (value.emailProvider === "outlook" && !["outlook.com", "hotmail.com"].includes(domain)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["emailAddress"], message: "Outlook / Hotmail connections must use an @outlook.com or @hotmail.com address." });
  }
}

export const createAccountInput = z.object({
  label: z.string().trim().min(1).max(120),
  loginEmail: z.string().trim().email().max(320),
  password: z.string().min(1).max(500),
  apiKey: z.string().min(1).max(2000),
  emailProvider: emailProviderSchema,
  emailAddress: z.preprocess(optionalMailbox, emailAddressSchema.optional()),
}).superRefine(validateProviderMailbox);

export const updateAccountInput = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  loginEmail: z.string().trim().email().max(320).optional(),
  password: z.string().min(1).max(500).optional(),
  apiKey: z.string().min(1).max(2000).optional(),
  emailProvider: emailProviderSchema.optional(),
  emailAddress: z.preprocess(nullableMailbox, emailAddressSchema.nullable().optional()),
}).superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field must be supplied." });
  }
  if ((value.emailProvider !== undefined) !== (value.emailAddress !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["emailAddress"], message: "When changing mailbox settings, supply both emailProvider and emailAddress. emailAddress may be null." });
  }
  validateProviderMailbox(value, ctx);
});

export async function createKripiAccount(input: z.infer<typeof createAccountInput>, session: AuthSession, request: Request, requestId: string) {
  return withTransaction(async (db) => {
    const apiKeyHint = `••••••••${input.apiKey.slice(-4)}`;
    const result = await db.query<{ id: string }>(
      `INSERT INTO kripi_accounts(label, login_email, encrypted_password, encrypted_api_key, api_key_hint, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6::uuid, $6::uuid)
       RETURNING id`,
      [input.label, input.loginEmail.toLowerCase(), encryptSecret(input.password), encryptSecret(input.apiKey), apiKeyHint, session.principal.id],
    );
    const id = result.rows[0].id;
    await db.query(
      `INSERT INTO email_accounts(account_id, provider, email_address, connection_status)
       VALUES ($1::uuid, $2, $3, 'not_connected')`,
      [id, input.emailProvider, input.emailAddress?.toLowerCase() ?? null],
    );
    await db.query(
      `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, ip, request_id)
       VALUES ('admin', $1::uuid, 'account.create', 'kripi_account', $2, $3::jsonb, $4::inet, $5)`,
      [session.principal.id, id, JSON.stringify({ label: input.label, loginEmail: input.loginEmail.toLowerCase(), emailProvider: input.emailProvider }), requestIp(request), requestId],
    );
    return id;
  });
}

export async function updateKripiAccount(id: string, input: z.infer<typeof updateAccountInput>, session: AuthSession, request: Request, requestId: string) {
  await withTransaction(async (db) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (sql: string, value: unknown) => {
      values.push(value);
      fields.push(sql.replace("$VALUE", `$${values.length}`));
    };
    if (input.label !== undefined) set("label = $VALUE", input.label);
    if (input.loginEmail !== undefined) set("login_email = $VALUE", input.loginEmail.toLowerCase());
    if (input.password !== undefined) set("encrypted_password = $VALUE", encryptSecret(input.password));
    if (input.apiKey !== undefined) {
      set("encrypted_api_key = $VALUE", encryptSecret(input.apiKey));
      set("api_key_hint = $VALUE", `••••••••${input.apiKey.slice(-4)}`);
      fields.push("status = 'pending'");
      fields.push("last_verified_at = NULL");
    }
    values.push(session.principal.id);
    fields.push(`updated_by = $${values.length}::uuid`);
    fields.push("updated_at = now()");
    values.push(id);

    const result = await db.query(
      `UPDATE kripi_accounts SET ${fields.join(", ")} WHERE id = $${values.length}::uuid AND archived_at IS NULL RETURNING id`,
      values,
    );
    if (!result.rowCount) throw new ApiError(404, "not_found", "Account not found.");

    if (input.emailProvider !== undefined && input.emailAddress !== undefined) {
      await db.query(
        `INSERT INTO email_accounts(account_id, provider, email_address, connection_status, updated_at)
         VALUES ($1::uuid, $2, $3, 'not_connected', now())
         ON CONFLICT (account_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           email_address = EXCLUDED.email_address,
           encrypted_refresh_token = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.encrypted_refresh_token
           END,
           encrypted_access_token = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.encrypted_access_token
           END,
           token_expires_at = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.token_expires_at
           END,
           provider_subject = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.provider_subject
           END,
           provider_identity_email = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.provider_identity_email
           END,
           oauth_scope = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.oauth_scope
           END,
           encrypted_sync_cursor = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.encrypted_sync_cursor
           END,
           connection_status = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN 'not_connected'
             ELSE email_accounts.connection_status
           END,
           last_error_code = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.last_error_code
           END,
           last_error_message = CASE
             WHEN email_accounts.provider IS DISTINCT FROM EXCLUDED.provider OR lower(email_accounts.email_address) IS DISTINCT FROM lower(EXCLUDED.email_address) THEN NULL
             ELSE email_accounts.last_error_message
           END,
           updated_at = now()`,
        [id, input.emailProvider, input.emailAddress?.toLowerCase() ?? null],
      );
    }

    await db.query(
      `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, ip, request_id)
       VALUES ('admin', $1::uuid, 'account.update', 'kripi_account', $2, $3::jsonb, $4::inet, $5)`,
      [session.principal.id, id, JSON.stringify({ changedFields: Object.keys(input) }), requestIp(request), requestId],
    );
  });
}

export async function revealKripiAccountSecrets(id: string, session: AuthSession, request: Request, requestId: string) {
  const result = await getPool().query<{ login_email: string; encrypted_password: string; encrypted_api_key: string }>(
    `SELECT login_email, encrypted_password, encrypted_api_key FROM kripi_accounts WHERE id = $1::uuid AND archived_at IS NULL`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Account not found.");
  if (!row.encrypted_password.startsWith("v1.") || !row.encrypted_api_key.startsWith("v1.")) {
    throw new ApiError(409, "secret_unavailable", "This account contains demo/legacy placeholder credentials. Update the account with real credentials before revealing them.");
  }
  const secrets = {
    loginEmail: row.login_email,
    password: decryptSecret(row.encrypted_password),
    apiKey: decryptSecret(row.encrypted_api_key),
  };
  await auditAdminEvent({
    adminId: session.principal.id,
    action: "account.secrets.reveal",
    entityType: "kripi_account",
    entityId: id,
    request,
    requestId,
  });
  return secrets;
}


export async function archiveKripiAccount(id: string, session: AuthSession, request: Request, requestId: string) {
  await withTransaction(async (db) => {
    const assignment = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM telegram_account_assignments WHERE account_id=$1::uuid`,
      [id],
    );
    if ((assignment.rows[0]?.count ?? 0) > 0) {
      throw new ApiError(409, "account_still_assigned", "Reassign or remove Telegram clients before archiving this account.");
    }
    const result = await db.query(
      `UPDATE kripi_accounts
          SET status='archived', archived_at=now(), updated_by=$2::uuid, updated_at=now()
        WHERE id=$1::uuid AND archived_at IS NULL
        RETURNING id`,
      [id, session.principal.id],
    );
    if (!result.rowCount) throw new ApiError(404, "not_found", "Account not found.");
    await db.query(
      `UPDATE email_accounts
          SET connection_status='disabled', encrypted_refresh_token=NULL, encrypted_access_token=NULL,
              token_expires_at=NULL, encrypted_sync_cursor=NULL, updated_at=now()
        WHERE account_id=$1::uuid`,
      [id],
    );
    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id)
       VALUES('admin',$1::uuid,'account.archive','kripi_account',$2,'{}'::jsonb,$3::inet,$4)`,
      [session.principal.id, id, requestIp(request), requestId],
    );
  });
}
