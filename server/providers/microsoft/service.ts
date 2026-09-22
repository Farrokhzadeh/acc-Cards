import { classifyPendingEmailMessages } from "@/server/email/classifier";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "@/server/security/crypto";
import {
  buildMicrosoftAuthorizationUrl,
  createPkcePair,
  exchangeMicrosoftAuthorizationCode,
  getMicrosoftInboxDeltaPage,
  getMicrosoftMessageText,
  getMicrosoftProfile,
  refreshMicrosoftAccessToken,
} from "@/server/providers/microsoft/client";
import { MicrosoftIntegrationError } from "@/server/providers/microsoft/errors";
import type { MicrosoftMessage } from "@/server/providers/microsoft/schemas";
import { runtimeControlEnabled } from "@/server/operations/controls";

const OAUTH_STATE_MINUTES = 10;
const MAX_DELTA_PAGES_PER_SYNC = 20;

type OutlookConnectionRow = {
  id: string;
  account_id: string;
  provider: "outlook" | "gmail";
  email_address: string;
  encrypted_refresh_token: string | null;
  encrypted_sync_cursor: string | null;
  connection_status: string;
};

type OAuthStateRow = {
  id: string;
  admin_id: string;
  admin_session_id: string;
  account_id: string;
  encrypted_pkce_verifier: string;
  redirect_uri: string;
  expires_at: Date;
  consumed_at: Date | null;
};

function redirectUri() {
  const env = parseServerEnv(process.env);
  return new URL("/api/v1/email/outlook/callback", env.APP_BASE_URL).toString();
}

function microsoftConfigured() {
  const env = parseServerEnv(process.env);
  return Boolean(env.MICROSOFT_OAUTH_CLIENT_ID && env.MICROSOFT_OAUTH_CLIENT_SECRET);
}

async function getOutlookConnection(accountId: string) {
  const result = await getPool().query<OutlookConnectionRow>(
    `SELECT e.id, e.account_id, e.provider, e.email_address, e.encrypted_refresh_token,
            e.encrypted_sync_cursor, e.connection_status
       FROM email_accounts e
       JOIN kripi_accounts a ON a.id = e.account_id
      WHERE e.account_id = $1::uuid
        AND a.archived_at IS NULL`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "email_account_not_found", "This account does not have an email connection record.");
  if (row.provider !== "outlook") {
    throw new ApiError(409, "wrong_email_provider", "This account is configured for Gmail, not Outlook/Hotmail.");
  }
  return row;
}

export async function startOutlookConnection(accountId: string, session: AuthSession, request: Request, requestId: string) {
  if (!microsoftConfigured()) {
    throw new ApiError(503, "microsoft_not_configured", "Microsoft Outlook OAuth is not configured on this deployment.");
  }
  await getOutlookConnection(accountId);

  const state = randomToken(32);
  const { verifier, challenge } = createPkcePair();
  const callback = redirectUri();
  await getPool().query(`DELETE FROM admin_oauth_states WHERE expires_at < now() OR consumed_at IS NOT NULL`);
  await getPool().query(
    `INSERT INTO admin_oauth_states(admin_id, admin_session_id, account_id, provider, state_hash, encrypted_pkce_verifier, redirect_uri, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'outlook', $4, $5, $6, now() + ($7::int * interval '1 minute'))`,
    [session.principal.id, session.id, accountId, sha256Hex(state), encryptSecret(verifier), callback, OAUTH_STATE_MINUTES],
  );

  await auditAdminEvent({
    adminId: session.principal.id,
    action: "email.outlook.connect_started",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
  });

  return {
    authorizationUrl: buildMicrosoftAuthorizationUrl({ state, redirectUri: callback, codeChallenge: challenge }),
    expiresInSeconds: OAUTH_STATE_MINUTES * 60,
  };
}

export async function completeOutlookConnection(args: {
  state: string;
  code: string;
  session: AuthSession;
  request: Request;
  requestId: string;
}) {
  const stateHash = sha256Hex(args.state);
  const result = await getPool().query<OAuthStateRow>(
    `UPDATE admin_oauth_states
        SET consumed_at = now()
      WHERE state_hash = $1
        AND provider = 'outlook'
        AND admin_id = $2::uuid
        AND admin_session_id = $3::uuid
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, admin_id, admin_session_id, account_id, encrypted_pkce_verifier, redirect_uri, expires_at, consumed_at`,
    [stateHash, args.session.principal.id, args.session.id],
  );
  const state = result.rows[0];
  if (!state) {
    throw new ApiError(400, "invalid_oauth_state", "The Microsoft connection request is invalid, expired, or belongs to another administrator session.");
  }

  try {
    const token = await exchangeMicrosoftAuthorizationCode({
      code: args.code,
      redirectUri: state.redirect_uri,
      codeVerifier: decryptSecret(state.encrypted_pkce_verifier),
    });
    if (!token.refresh_token) {
      throw new ApiError(502, "missing_refresh_token", "Microsoft did not return an offline refresh token. Reconnect and grant mailbox access.");
    }
    const refreshToken = token.refresh_token;
    const profile = await getMicrosoftProfile(token.access_token);
    const providerIdentityEmail = (profile.mail || profile.userPrincipalName || "").trim().toLowerCase() || null;
    const configuredConnection = await getOutlookConnection(state.account_id);
    if (!providerIdentityEmail || providerIdentityEmail !== configuredConnection.email_address.trim().toLowerCase()) {
      throw new ApiError(409, "microsoft_mailbox_mismatch", "The Microsoft account you authorized does not match the Outlook/Hotmail mailbox configured for this AccAbad account.");
    }

    await withTransaction(async (db) => {
      const update = await db.query(
        `UPDATE email_accounts
            SET encrypted_refresh_token = $2,
                encrypted_access_token = NULL,
                token_expires_at = $3,
                provider_subject = $4,
                provider_identity_email = $5,
                oauth_scope = $6,
                encrypted_sync_cursor = NULL,
                connection_status = 'connected',
                connected_at = now(),
                last_error_code = NULL,
                last_error_message = NULL,
                updated_at = now()
          WHERE account_id = $1::uuid AND provider = 'outlook'
          RETURNING id`,
        [
          state.account_id,
          encryptSecret(refreshToken),
          new Date(Date.now() + token.expires_in * 1000),
          profile.id,
          providerIdentityEmail,
          token.scope ?? null,
        ],
      );
      if (!update.rowCount) throw new ApiError(404, "email_account_not_found", "The Outlook connection record no longer exists.");
    });

    await auditAdminEvent({
      adminId: args.session.principal.id,
      action: "email.outlook.connected",
      entityType: "kripi_account",
      entityId: state.account_id,
      request: args.request,
      requestId: args.requestId,
      metadata: { providerIdentityEmail },
    });
    return { accountId: state.account_id, providerIdentityEmail };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof MicrosoftIntegrationError) {
      throw new ApiError(error.status, error.code, error.message);
    }
    throw error;
  }
}

function normalizeMessage(message: MicrosoftMessage) {
  const sender = message.from?.emailAddress?.address?.trim().toLowerCase() || "unknown@unknown";
  const recipient = message.toRecipients?.[0]?.emailAddress?.address?.trim().toLowerCase() || null;
  return {
    id: message.id,
    sender,
    recipient,
    subject: message.subject?.trim() || "(no subject)",
    preview: message.bodyPreview?.trim() || "",
    receivedAt: new Date(message.receivedDateTime),
    unread: !message.isRead,
    internetMessageId: message.internetMessageId ?? null,
    hasAttachments: message.hasAttachments,
  };
}

async function collectInboxDelta(accessToken: string, initialCursor: string | null) {
  const messages: MicrosoftMessage[] = [];
  const removedIds: string[] = [];
  let cursor = initialCursor;
  let pages = 0;
  let partial = false;

  while (pages < MAX_DELTA_PAGES_PER_SYNC) {
    const page = await getMicrosoftInboxDeltaPage(accessToken, cursor);
    pages += 1;
    for (const item of page.value) {
      if ("@removed" in item) removedIds.push(item.id);
      else messages.push(item);
    }
    if (page["@odata.nextLink"]) {
      cursor = page["@odata.nextLink"];
      if (pages >= MAX_DELTA_PAGES_PER_SYNC) {
        partial = true;
        break;
      }
      continue;
    }
    cursor = page["@odata.deltaLink"] ?? null;
    break;
  }
  return { messages, removedIds, cursor, pages, partial };
}

async function markOutlookAuthRequired(emailAccountId: string, code: string, message: string) {
  await getPool().query(
    `UPDATE email_accounts
        SET connection_status = 'reauth_required',
            encrypted_refresh_token = NULL,
            encrypted_access_token = NULL,
            token_expires_at = NULL,
            encrypted_sync_cursor = NULL,
            last_error_code = $2,
            last_error_message = $3,
            last_sync_attempt_at = now(),
            updated_at = now()
      WHERE id = $1::uuid`,
    [emailAccountId, code, message],
  );
}

async function syncOutlookInboxCore(accountId: string) {
  if (!await runtimeControlEnabled("outlook_sync")) {
    throw new ApiError(503, "runtime_kill_switch", "Outlook synchronization is disabled by an emergency runtime control.");
  }
  const connection = await getOutlookConnection(accountId);
  if (!connection.encrypted_refresh_token) {
    throw new ApiError(409, "outlook_not_connected", "Connect this Outlook/Hotmail mailbox before synchronizing it.");
  }
  await getPool().query(`UPDATE email_accounts SET last_sync_attempt_at = now(), updated_at = now() WHERE id = $1::uuid`, [connection.id]);

  try {
    const currentRefreshToken = decryptSecret(connection.encrypted_refresh_token);
    const token = await refreshMicrosoftAccessToken(currentRefreshToken);
    const rotatedRefreshToken = token.refresh_token ?? currentRefreshToken;
    const storedCursor = connection.encrypted_sync_cursor ? decryptSecret(connection.encrypted_sync_cursor) : null;
    let delta;
    try {
      delta = await collectInboxDelta(token.access_token, storedCursor);
    } catch (error) {
      if (error instanceof MicrosoftIntegrationError && error.code === "microsoft_sync_cursor_expired" && storedCursor) {
        delta = await collectInboxDelta(token.access_token, null);
      } else {
        throw error;
      }
    }
    const { messages, removedIds, cursor, pages, partial } = delta;

    let insertedOrUpdated = 0;
    await withTransaction(async (db) => {
      for (const raw of messages) {
        const message = normalizeMessage(raw);
        const result = await db.query(
          `INSERT INTO email_messages(
             email_account_id, provider_message_id, sender, recipient, subject, preview,
             category, received_at, is_unread, safe_metadata
           ) VALUES (
             $1::uuid, $2, $3, $4, $5, $6,
             'normal', $7, $8, $9::jsonb
           )
           ON CONFLICT (email_account_id, provider_message_id) DO UPDATE SET
             sender = EXCLUDED.sender,
             recipient = EXCLUDED.recipient,
             subject = EXCLUDED.subject,
             preview = EXCLUDED.preview,
             received_at = EXCLUDED.received_at,
             is_unread = EXCLUDED.is_unread,
             safe_metadata = email_messages.safe_metadata || EXCLUDED.safe_metadata
           RETURNING id`,
          [
            connection.id,
            message.id,
            message.sender,
            message.recipient,
            message.subject,
            message.preview,
            message.receivedAt,
            message.unread,
            JSON.stringify({ provider: "outlook", internetMessageId: message.internetMessageId, hasAttachments: message.hasAttachments, providerRemoved: false }),
          ],
        );
        insertedOrUpdated += result.rowCount ?? 0;
      }

      if (removedIds.length) {
        await db.query(
          `UPDATE email_messages
              SET is_unread = false,
                  safe_metadata = safe_metadata || '{"providerRemoved":true}'::jsonb
            WHERE email_account_id = $1::uuid
              AND provider_message_id = ANY($2::text[])`,
          [connection.id, removedIds],
        );
      }

      await db.query(
        `UPDATE email_accounts
            SET encrypted_refresh_token = $2,
                encrypted_access_token = NULL,
                token_expires_at = $3,
                oauth_scope = $4,
                encrypted_sync_cursor = $5,
                connection_status = 'connected',
                last_synced_at = now(),
                last_sync_attempt_at = now(),
                last_error_code = NULL,
                last_error_message = NULL,
                updated_at = now()
          WHERE id = $1::uuid`,
        [
          connection.id,
          encryptSecret(rotatedRefreshToken),
          new Date(Date.now() + token.expires_in * 1000),
          token.scope ?? null,
          cursor ? encryptSecret(cursor) : null,
        ],
      );
    });

    const classification = await classifyPendingEmailMessages({
      accountId,
      limit: 200,
      resolveMessageText: (message) => getMicrosoftMessageText(token.access_token, message.providerMessageId),
    });
    return { received: messages.length, removed: removedIds.length, insertedOrUpdated, pages, partial, classification };
  } catch (error) {
    if (error instanceof MicrosoftIntegrationError) {
      if (error.authRequired) {
        await markOutlookAuthRequired(connection.id, error.code, error.message);
      } else {
        await getPool().query(
          `UPDATE email_accounts
              SET connection_status = 'error', last_error_code = $2, last_error_message = $3,
                  last_sync_attempt_at = now(), updated_at = now()
            WHERE id = $1::uuid`,
          [connection.id, error.code, error.message],
        );
      }
      throw new ApiError(error.status, error.code, error.message);
    }
    throw error;
  }
}

export async function syncOutlookInbox(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const result = await syncOutlookInboxCore(accountId);
  await auditAdminEvent({
    adminId: session.principal.id,
    action: "email.outlook.sync",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
    metadata: result,
  });
  return result;
}

export async function syncConnectedOutlookInboxesSystem(requestId: string) {
  if (!microsoftConfigured()) {
    throw new ApiError(503, "microsoft_not_configured", "Microsoft Outlook OAuth is not configured on this deployment.");
  }

  const run = await getPool().query<{ id: string }>(
    `INSERT INTO job_runs(job_type, job_key, status, safe_metadata)
     VALUES ('sync_outlook_inboxes', 'outlook-connected', 'running', '{}'::jsonb)
     RETURNING id`,
  );
  const jobRunId = run.rows[0].id;

  try {
    const accounts = await getPool().query<{ account_id: string }>(
      `SELECT account_id
         FROM email_accounts
        WHERE provider = 'outlook'
          AND connection_status = 'connected'
          AND encrypted_refresh_token IS NOT NULL
        ORDER BY COALESCE(last_sync_attempt_at, 'epoch'::timestamptz) ASC, account_id ASC
        LIMIT 100`,
    );

    let succeeded = 0;
    let failed = 0;
    const failedAccountIds: string[] = [];

    for (const row of accounts.rows) {
      try {
        await syncOutlookInboxCore(row.account_id);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        failedAccountIds.push(row.account_id);
        console.warn("[outlook-sync] mailbox sync failed", {
          requestId,
          accountId: row.account_id,
          errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "unknown",
        });
      }
    }

    const attempted = accounts.rows.length;
    const status = failed > 0 ? "failed" : "succeeded";
    const metadata = {
      attempted,
      succeeded,
      failed,
      // IDs are internal references only; no mailbox addresses or provider payloads are logged.
      failedAccountIds,
    };

    await withTransaction(async (db) => {
      await db.query(
        `UPDATE job_runs
            SET status = $2,
                finished_at = now(),
                error_redacted = CASE WHEN $2 = 'failed' THEN 'One or more Outlook mailbox synchronizations failed.' ELSE NULL END,
                safe_metadata = $3::jsonb
          WHERE id = $1::uuid`,
        [jobRunId, status, JSON.stringify(metadata)],
      );
      await db.query(
        `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, request_id)
         VALUES ('worker', NULL, 'email.outlook.sync.worker', 'job_run', $1, $2::jsonb, $3)`,
        [jobRunId, JSON.stringify({ attempted, succeeded, failed }), requestId],
      );
    });

    return { jobRunId, ...metadata };
  } catch (error) {
    await getPool().query(
      `UPDATE job_runs
          SET status = 'failed', finished_at = now(), error_redacted = 'Outlook mailbox sync job failed before completion.'
        WHERE id = $1::uuid`,
      [jobRunId],
    ).catch(() => {});
    throw error;
  }
}

export async function disconnectOutlook(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const connection = await getOutlookConnection(accountId);
  await getPool().query(
    `UPDATE email_accounts
        SET encrypted_refresh_token = NULL,
            encrypted_access_token = NULL,
            token_expires_at = NULL,
            provider_subject = NULL,
            provider_identity_email = NULL,
            oauth_scope = NULL,
            encrypted_sync_cursor = NULL,
            connection_status = 'not_connected',
            last_error_code = NULL,
            last_error_message = NULL,
            updated_at = now()
      WHERE id = $1::uuid`,
    [connection.id],
  );
  await auditAdminEvent({
    adminId: session.principal.id,
    action: "email.outlook.disconnected",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
    metadata: { mailbox: connection.email_address },
  });
  return { disconnected: true };
}

export async function listStoredEmailMessages(accountId: string, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(200, limit));
  const connection = await getPool().query<{ id: string }>(
    `SELECT id FROM email_accounts WHERE account_id = $1::uuid`,
    [accountId],
  );
  const emailAccountId = connection.rows[0]?.id;
  if (!emailAccountId) throw new ApiError(404, "email_account_not_found", "This account does not have an email connection record.");
  const result = await getPool().query<{
    id: string;
    provider_message_id: string;
    sender: string;
    recipient: string | null;
    subject: string | null;
    preview: string | null;
    category: string;
    received_at: Date;
    is_unread: boolean;
    safe_metadata: Record<string, unknown>;
  }>(
    `SELECT id, provider_message_id, sender, recipient, subject, preview, category, received_at, is_unread, safe_metadata
       FROM email_messages
      WHERE email_account_id = $1::uuid
      ORDER BY received_at DESC, id DESC
      LIMIT $2`,
    [emailAccountId, boundedLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    providerMessageId: row.provider_message_id,
    sender: row.sender,
    recipient: row.recipient,
    subject: row.subject ?? "(no subject)",
    preview: row.preview ?? "",
    category: row.category,
    receivedAt: row.received_at.toISOString(),
    unread: row.is_unread,
    hasAttachments: Boolean(row.safe_metadata?.hasAttachments),
    providerRemoved: Boolean(row.safe_metadata?.providerRemoved),
  }));
}
