import { classifyPendingEmailMessages } from "@/server/email/classifier";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "@/server/security/crypto";
import {
  buildGoogleAuthorizationUrl,
  createGooglePkcePair,
  exchangeGoogleAuthorizationCode,
  getGmailMessageMetadata,
  getGmailMessageText,
  getGmailProfile,
  listGmailHistory,
  listGmailInboxMessages,
  refreshGoogleAccessToken,
} from "@/server/providers/google/client";
import { GoogleIntegrationError } from "@/server/providers/google/errors";
import type { GmailMessage } from "@/server/providers/google/schemas";
import { runtimeControlEnabled } from "@/server/operations/controls";

const OAUTH_STATE_MINUTES = 10;
const MAX_FULL_SYNC_PAGES = 4;
const MAX_HISTORY_PAGES = 20;
const MAX_CHANGED_MESSAGES_PER_SYNC = 250;

type GmailConnectionRow = {
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
  return new URL("/api/v1/email/gmail/callback", env.APP_BASE_URL).toString();
}

function googleConfigured() {
  const env = parseServerEnv(process.env);
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

async function getGmailConnection(accountId: string) {
  const result = await getPool().query<GmailConnectionRow>(
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
  if (row.provider !== "gmail") {
    throw new ApiError(409, "wrong_email_provider", "This account is configured for Outlook/Hotmail, not Gmail.");
  }
  return row;
}

export async function startGmailConnection(accountId: string, session: AuthSession, request: Request, requestId: string) {
  if (!googleConfigured()) {
    throw new ApiError(503, "google_not_configured", "Google Gmail OAuth is not configured on this deployment.");
  }
  await getGmailConnection(accountId);

  const state = randomToken(32);
  const { verifier, challenge } = createGooglePkcePair();
  const callback = redirectUri();
  await getPool().query(`DELETE FROM admin_oauth_states WHERE expires_at < now() OR consumed_at IS NOT NULL`);
  await getPool().query(
    `INSERT INTO admin_oauth_states(admin_id, admin_session_id, account_id, provider, state_hash, encrypted_pkce_verifier, redirect_uri, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'gmail', $4, $5, $6, now() + ($7::int * interval '1 minute'))`,
    [session.principal.id, session.id, accountId, sha256Hex(state), encryptSecret(verifier), callback, OAUTH_STATE_MINUTES],
  );

  await auditAdminEvent({
    adminId: session.principal.id,
    action: "email.gmail.connect_started",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
  });

  return {
    authorizationUrl: buildGoogleAuthorizationUrl({ state, redirectUri: callback, codeChallenge: challenge }),
    expiresInSeconds: OAUTH_STATE_MINUTES * 60,
  };
}

export async function completeGmailConnection(args: {
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
        AND provider = 'gmail'
        AND admin_id = $2::uuid
        AND admin_session_id = $3::uuid
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, admin_id, admin_session_id, account_id, encrypted_pkce_verifier, redirect_uri, expires_at, consumed_at`,
    [stateHash, args.session.principal.id, args.session.id],
  );
  const state = result.rows[0];
  if (!state) {
    throw new ApiError(400, "invalid_oauth_state", "The Google connection request is invalid, expired, or belongs to another administrator session.");
  }

  try {
    const token = await exchangeGoogleAuthorizationCode({
      code: args.code,
      redirectUri: state.redirect_uri,
      codeVerifier: decryptSecret(state.encrypted_pkce_verifier),
    });
    if (!token.refresh_token) {
      throw new ApiError(502, "missing_refresh_token", "Google did not return an offline refresh token. Reconnect and grant Gmail access again.");
    }
    const refreshToken = token.refresh_token;

    const profile = await getGmailProfile(token.access_token);
    const providerIdentityEmail = profile.emailAddress.trim().toLowerCase();
    const configuredConnection = await getGmailConnection(state.account_id);
    if (providerIdentityEmail !== configuredConnection.email_address.trim().toLowerCase()) {
      throw new ApiError(409, "google_mailbox_mismatch", "The Google account you authorized does not match the Gmail mailbox configured for this AccAbad account.");
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
          WHERE account_id = $1::uuid AND provider = 'gmail'
          RETURNING id`,
        [
          state.account_id,
          encryptSecret(refreshToken),
          new Date(Date.now() + token.expires_in * 1000),
          providerIdentityEmail,
          providerIdentityEmail,
          token.scope ?? null,
        ],
      );
      if (!update.rowCount) throw new ApiError(404, "email_account_not_found", "The Gmail connection record no longer exists.");
    });

    await auditAdminEvent({
      adminId: args.session.principal.id,
      action: "email.gmail.connected",
      entityType: "kripi_account",
      entityId: state.account_id,
      request: args.request,
      requestId: args.requestId,
      metadata: { providerIdentityEmail },
    });
    return { accountId: state.account_id, providerIdentityEmail };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof GoogleIntegrationError) {
      throw new ApiError(error.status, error.code, error.message);
    }
    throw error;
  }
}

function headerValue(message: GmailMessage, name: string) {
  const headers = message.payload?.headers ?? [];
  return headers.find((header: { name: string; value: string }) => header.name.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function firstEmail(value: string) {
  const angle = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const plain = value.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return plain?.[1]?.trim().toLowerCase() ?? null;
}

function hasAttachmentPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const value = part as { filename?: unknown; parts?: unknown };
  if (typeof value.filename === "string" && value.filename.trim()) return true;
  return Array.isArray(value.parts) && value.parts.some(hasAttachmentPart);
}

function normalizeGmailMessage(message: GmailMessage, configuredMailbox: string) {
  const sender = firstEmail(headerValue(message, "From")) ?? "unknown@unknown";
  const recipient = firstEmail(headerValue(message, "To")) ?? configuredMailbox.trim().toLowerCase();
  const internalDateMs = message.internalDate ? Number(message.internalDate) : NaN;
  const receivedAt = Number.isFinite(internalDateMs) ? new Date(internalDateMs) : new Date();
  return {
    id: message.id,
    sender,
    recipient,
    subject: headerValue(message, "Subject") || "(no subject)",
    preview: message.snippet?.trim() || "",
    receivedAt,
    unread: message.labelIds.includes("UNREAD"),
    inInbox: message.labelIds.includes("INBOX"),
    internetMessageId: headerValue(message, "Message-ID") || null,
    hasAttachments: hasAttachmentPart(message.payload),
    historyId: message.historyId ?? null,
    threadId: message.threadId ?? null,
  };
}

async function fetchMessages(accessToken: string, ids: Iterable<string>, configuredMailbox: string) {
  const messages: ReturnType<typeof normalizeGmailMessage>[] = [];
  const removedIds: string[] = [];
  for (const id of ids) {
    try {
      const raw = await getGmailMessageMetadata(accessToken, id);
      const normalized = normalizeGmailMessage(raw, configuredMailbox);
      if (normalized.inInbox) messages.push(normalized);
      else removedIds.push(id);
    } catch (error) {
      if (error instanceof GoogleIntegrationError && error.code === "gmail_message_not_found") {
        removedIds.push(id);
        continue;
      }
      throw error;
    }
  }
  return { messages, removedIds };
}

async function collectFullInbox(accessToken: string, configuredMailbox: string) {
  const profile = await getGmailProfile(accessToken);
  const ids: string[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  let partial = false;

  while (pages < MAX_FULL_SYNC_PAGES) {
    const page = await listGmailInboxMessages(accessToken, pageToken);
    pages += 1;
    ids.push(...page.messages.map((message) => message.id));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
    if (pages >= MAX_FULL_SYNC_PAGES) partial = true;
  }

  const fetched = await fetchMessages(accessToken, ids, configuredMailbox);
  return {
    ...fetched,
    cursor: profile.historyId,
    pages,
    partial,
    fullSync: true,
  };
}

async function collectIncrementalInbox(accessToken: string, startHistoryId: string, configuredMailbox: string) {
  const changedIds = new Set<string>();
  const removedIds = new Set<string>();
  let pageToken: string | null = null;
  let cursor = startHistoryId;
  let pages = 0;
  let partial = false;

  while (pages < MAX_HISTORY_PAGES) {
    const page = await listGmailHistory(accessToken, startHistoryId, pageToken);
    pages += 1;
    cursor = page.historyId;
    for (const history of page.history) {
      for (const message of history.messages) changedIds.add(message.id);
      for (const item of history.messagesAdded) changedIds.add(item.message.id);
      for (const item of history.labelsAdded) changedIds.add(item.message.id);
      for (const item of history.labelsRemoved) {
        changedIds.add(item.message.id);
        if (item.labelIds.includes("INBOX")) removedIds.add(item.message.id);
      }
      for (const item of history.messagesDeleted) removedIds.add(item.message.id);
    }
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
    if (pages >= MAX_HISTORY_PAGES) partial = true;
  }

  if (changedIds.size > MAX_CHANGED_MESSAGES_PER_SYNC) {
    return collectFullInbox(accessToken, configuredMailbox);
  }

  for (const id of removedIds) changedIds.delete(id);
  const fetched = await fetchMessages(accessToken, changedIds, configuredMailbox);
  for (const id of fetched.removedIds) removedIds.add(id);
  return {
    messages: fetched.messages,
    removedIds: [...removedIds],
    cursor,
    pages,
    partial,
    fullSync: false,
  };
}

async function persistGmailSync(args: {
  connection: GmailConnectionRow;
  refreshToken: string;
  tokenExpiresAt: Date;
  scope: string | null;
  messages: ReturnType<typeof normalizeGmailMessage>[];
  removedIds: string[];
  cursor: string;
}) {
  let insertedOrUpdated = 0;
  await withTransaction(async (db) => {
    for (const message of args.messages) {
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
          args.connection.id,
          message.id,
          message.sender,
          message.recipient,
          message.subject,
          message.preview,
          message.receivedAt,
          message.unread,
          JSON.stringify({
            provider: "gmail",
            threadId: message.threadId,
            historyId: message.historyId,
            internetMessageId: message.internetMessageId,
            hasAttachments: message.hasAttachments,
            providerRemoved: false,
          }),
        ],
      );
      insertedOrUpdated += result.rowCount ?? 0;
    }

    if (args.removedIds.length) {
      await db.query(
        `UPDATE email_messages
            SET is_unread = false,
                safe_metadata = safe_metadata || '{"providerRemoved":true}'::jsonb
          WHERE email_account_id = $1::uuid
            AND provider_message_id = ANY($2::text[])`,
        [args.connection.id, args.removedIds],
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
        args.connection.id,
        encryptSecret(args.refreshToken),
        args.tokenExpiresAt,
        args.scope,
        encryptSecret(args.cursor),
      ],
    );
  });
  return insertedOrUpdated;
}

async function markGmailAuthRequired(emailAccountId: string, code: string, message: string) {
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

async function syncGmailInboxCore(accountId: string) {
  if (!await runtimeControlEnabled("gmail_sync")) {
    throw new ApiError(503, "runtime_kill_switch", "Gmail synchronization is disabled by an emergency runtime control.");
  }
  const connection = await getGmailConnection(accountId);
  if (!connection.encrypted_refresh_token) {
    throw new ApiError(409, "gmail_not_connected", "Connect this Gmail mailbox before synchronizing it.");
  }
  await getPool().query(`UPDATE email_accounts SET last_sync_attempt_at = now(), updated_at = now() WHERE id = $1::uuid`, [connection.id]);

  try {
    const currentRefreshToken = decryptSecret(connection.encrypted_refresh_token);
    const token = await refreshGoogleAccessToken(currentRefreshToken);
    const rotatedRefreshToken = token.refresh_token ?? currentRefreshToken;
    const storedCursor = connection.encrypted_sync_cursor ? decryptSecret(connection.encrypted_sync_cursor) : null;

    let sync;
    if (!storedCursor) {
      sync = await collectFullInbox(token.access_token, connection.email_address);
    } else {
      try {
        sync = await collectIncrementalInbox(token.access_token, storedCursor, connection.email_address);
      } catch (error) {
        if (error instanceof GoogleIntegrationError && error.code === "gmail_sync_cursor_expired") {
          sync = await collectFullInbox(token.access_token, connection.email_address);
        } else {
          throw error;
        }
      }
    }

    const insertedOrUpdated = await persistGmailSync({
      connection,
      refreshToken: rotatedRefreshToken,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scope: token.scope ?? null,
      messages: sync.messages,
      removedIds: sync.removedIds,
      cursor: sync.cursor,
    });

    const classification = await classifyPendingEmailMessages({
      accountId,
      limit: 200,
      resolveMessageText: (message) => getGmailMessageText(token.access_token, message.providerMessageId),
    });
    return {
      received: sync.messages.length,
      removed: sync.removedIds.length,
      insertedOrUpdated,
      pages: sync.pages,
      partial: sync.partial,
      fullSync: sync.fullSync,
      classification,
    };
  } catch (error) {
    if (error instanceof GoogleIntegrationError) {
      if (error.authRequired) {
        await markGmailAuthRequired(connection.id, error.code, error.message);
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

export async function syncGmailInbox(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const result = await syncGmailInboxCore(accountId);
  await auditAdminEvent({
    adminId: session.principal.id,
    action: "email.gmail.sync",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
    metadata: result,
  });
  return result;
}

export async function syncConnectedGmailInboxesSystem(requestId: string) {
  if (!googleConfigured()) {
    return { skipped: true, reason: "google_not_configured", attempted: 0, succeeded: 0, failed: 0, failedAccountIds: [] };
  }

  const run = await getPool().query<{ id: string }>(
    `INSERT INTO job_runs(job_type, job_key, status, safe_metadata)
     VALUES ('sync_gmail_inboxes', 'gmail-connected', 'running', '{}'::jsonb)
     RETURNING id`,
  );
  const jobRunId = run.rows[0].id;

  try {
    const accounts = await getPool().query<{ account_id: string }>(
      `SELECT account_id
         FROM email_accounts
        WHERE provider = 'gmail'
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
        await syncGmailInboxCore(row.account_id);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        failedAccountIds.push(row.account_id);
        console.warn("[gmail-sync] mailbox sync failed", {
          requestId,
          accountId: row.account_id,
          errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "unknown",
        });
      }
    }

    const attempted = accounts.rows.length;
    const status = failed > 0 ? "failed" : "succeeded";
    const metadata = { attempted, succeeded, failed, failedAccountIds };

    await withTransaction(async (db) => {
      await db.query(
        `UPDATE job_runs
            SET status = $2,
                finished_at = now(),
                error_redacted = CASE WHEN $2 = 'failed' THEN 'One or more Gmail mailbox synchronizations failed.' ELSE NULL END,
                safe_metadata = $3::jsonb
          WHERE id = $1::uuid`,
        [jobRunId, status, JSON.stringify(metadata)],
      );
      await db.query(
        `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, request_id)
         VALUES ('worker', NULL, 'email.gmail.sync.worker', 'job_run', $1, $2::jsonb, $3)`,
        [jobRunId, JSON.stringify({ attempted, succeeded, failed }), requestId],
      );
    });

    return { jobRunId, ...metadata };
  } catch (error) {
    await getPool().query(
      `UPDATE job_runs
          SET status = 'failed', finished_at = now(), error_redacted = 'Gmail mailbox sync job failed before completion.'
        WHERE id = $1::uuid`,
      [jobRunId],
    ).catch(() => {});
    throw error;
  }
}

export async function disconnectGmail(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const connection = await getGmailConnection(accountId);
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
    action: "email.gmail.disconnected",
    entityType: "kripi_account",
    entityId: accountId,
    request,
    requestId,
    metadata: { mailbox: connection.email_address },
  });
  return { disconnected: true };
}
