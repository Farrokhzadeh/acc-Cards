import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { decryptSecret, encryptSecret, generateTotpSecret, randomToken, sha256Hex, verifyPassword, verifyTotp, buildTotpUri } from "@/server/security/crypto";
import { CSRF_COOKIE, MFA_CHALLENGE_COOKIE, SESSION_COOKIE, parseCookies } from "@/server/auth/cookies";
import { requestIp, requestUserAgent } from "@/server/auth/request-meta";
import type { AdminPrincipal, AdminRole, AuthSession } from "@/server/auth/types";

type AdminAuthRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  status: "active" | "disabled" | "locked";
  mfa_enabled: boolean;
  mfa_secret_encrypted: string | null;
  role_name: AdminRole;
  permissions: string[];
};

type SessionRow = {
  session_id: string;
  token_hash: string;
  csrf_token_hash: string | null;
  reauthenticated_at: Date | null;
  expires_at: Date;
  admin_id: string;
  email: string;
  display_name: string;
  status: "active" | "disabled" | "locked";
  mfa_enabled: boolean;
  role_name: AdminRole;
  permissions: string[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function principalFrom(row: { admin_id?: string; id?: string; email: string; display_name: string; role_name: AdminRole; permissions: string[]; mfa_enabled: boolean }): AdminPrincipal {
  return {
    id: row.admin_id ?? row.id!,
    email: row.email,
    displayName: row.display_name,
    role: row.role_name,
    permissions: row.permissions ?? [],
    mfaEnabled: row.mfa_enabled,
  };
}

async function findAdminByEmail(email: string) {
  const result = await getPool().query<AdminAuthRow>(
    `SELECT a.id, a.email, a.display_name, a.password_hash, a.status, a.mfa_enabled, a.mfa_secret_encrypted,
            r.name AS role_name,
            COALESCE(array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL), ARRAY[]::text[]) AS permissions
       FROM admins a
       JOIN roles r ON r.id = a.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE lower(a.email) = lower($1)
      GROUP BY a.id, r.name`,
    [normalizeEmail(email)],
  );
  return result.rows[0] ?? null;
}

async function recordLoginAttempt(email: string, request: Request, success: boolean) {
  await getPool().query(
    `INSERT INTO admin_login_attempts(email_hash, ip, success)
     VALUES ($1, $2::inet, $3)`,
    [sha256Hex(normalizeEmail(email)), requestIp(request), success],
  );
}

async function assertLoginRateLimit(email: string, request: Request) {
  const env = parseServerEnv(process.env);
  const emailHash = sha256Hex(normalizeEmail(email));
  const ip = requestIp(request);
  const result = await getPool().query<{ failures: number }>(
    `SELECT COUNT(*)::int AS failures
       FROM admin_login_attempts
      WHERE success = false
        AND created_at > now() - ($1::int * interval '1 minute')
        AND (email_hash = $2 OR ($3::inet IS NOT NULL AND ip = $3::inet))`,
    [env.ADMIN_LOGIN_RATE_WINDOW_MINUTES, emailHash, ip],
  );
  if ((result.rows[0]?.failures ?? 0) >= env.ADMIN_LOGIN_RATE_MAX_FAILURES) {
    throw new ApiError(429, "rate_limited", "Too many failed login attempts. Try again later.");
  }
}

export async function auditAdminEvent(args: {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  request?: Request;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await getPool().query(
    `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, ip, request_id)
     VALUES ('admin', $1::uuid, $2, $3, $4, $5::jsonb, $6::inet, $7)`,
    [
      args.adminId ?? null,
      args.action,
      args.entityType,
      args.entityId ?? null,
      JSON.stringify(args.metadata ?? {}),
      args.request ? requestIp(args.request) : null,
      args.requestId ?? null,
    ],
  );
}

async function createSession(admin: AdminAuthRow, request: Request) {
  const env = parseServerEnv(process.env);
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(24);
  const maxAgeSeconds = env.ADMIN_SESSION_HOURS * 3600;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO admin_sessions(admin_id, token_hash, csrf_token_hash, ip, user_agent, expires_at, reauthenticated_at)
     VALUES ($1::uuid, $2, $3, $4::inet, $5, $6, now()) RETURNING id`,
    [admin.id, sha256Hex(sessionToken), sha256Hex(csrfToken), requestIp(request), requestUserAgent(request), expiresAt],
  );
  await getPool().query(`UPDATE admins SET last_login_at = now(), updated_at = now() WHERE id = $1::uuid`, [admin.id]);
  return {
    sessionId: result.rows[0].id,
    sessionToken,
    csrfToken,
    maxAgeSeconds,
    principal: principalFrom(admin),
  };
}

export async function loginWithPassword(email: string, password: string, request: Request) {
  await assertLoginRateLimit(email, request);
  const admin = await findAdminByEmail(email);
  const valid = Boolean(admin?.password_hash) && (await verifyPassword(password, admin!.password_hash!));
  if (!admin || !valid || admin.status !== "active") {
    await recordLoginAttempt(email, request, false);
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
  }
  await recordLoginAttempt(email, request, true);

  if (admin.mfa_enabled) {
    if (!admin.mfa_secret_encrypted) throw new ApiError(503, "mfa_configuration_error", "MFA is enabled but its secret is unavailable.");
    const env = parseServerEnv(process.env);
    const challengeToken = randomToken(32);
    await getPool().query(
      `INSERT INTO admin_auth_challenges(admin_id, token_hash, purpose, expires_at)
       VALUES ($1::uuid, $2, 'login_mfa', now() + ($3::int * interval '1 second'))`,
      [admin.id, sha256Hex(challengeToken), env.ADMIN_MFA_CHALLENGE_MINUTES * 60],
    );
    return { mfaRequired: true as const, challengeToken, challengeMaxAgeSeconds: env.ADMIN_MFA_CHALLENGE_MINUTES * 60, principal: principalFrom(admin) };
  }

  const session = await createSession(admin, request);
  await auditAdminEvent({ adminId: admin.id, action: "admin.login", entityType: "admin", entityId: admin.id, request });
  return { mfaRequired: false as const, ...session };
}

export async function completeLoginMfa(challengeToken: string, code: string, request: Request) {
  const result = await getPool().query<AdminAuthRow & { challenge_id: string; challenge_attempts: number }>(
    `SELECT c.id AS challenge_id, c.attempts AS challenge_attempts, a.id, a.email, a.display_name, a.password_hash, a.status, a.mfa_enabled,
            a.mfa_secret_encrypted, r.name AS role_name,
            COALESCE(array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL), ARRAY[]::text[]) AS permissions
       FROM admin_auth_challenges c
       JOIN admins a ON a.id = c.admin_id
       JOIN roles r ON r.id = a.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE c.token_hash = $1
        AND c.purpose = 'login_mfa'
        AND c.consumed_at IS NULL
        AND c.expires_at > now()
      GROUP BY c.id, a.id, r.name`,
    [sha256Hex(challengeToken)],
  );
  const admin = result.rows[0];
  if (!admin || admin.status !== "active" || !admin.mfa_enabled || !admin.mfa_secret_encrypted) {
    throw new ApiError(401, "invalid_mfa_challenge", "The MFA challenge is invalid or expired.");
  }
  if (!verifyTotp(decryptSecret(admin.mfa_secret_encrypted), code)) {
    const attempts = admin.challenge_attempts + 1;
    await getPool().query(
      `UPDATE admin_auth_challenges SET attempts = $2, consumed_at = CASE WHEN $2 >= 5 THEN now() ELSE consumed_at END WHERE id = $1::uuid`,
      [admin.challenge_id, attempts],
    );
    throw new ApiError(401, "invalid_mfa_code", attempts >= 5 ? "The MFA challenge has been invalidated after too many attempts." : "The authentication code is invalid.");
  }
  await getPool().query(`UPDATE admin_auth_challenges SET consumed_at = now() WHERE id = $1::uuid`, [admin.challenge_id]);
  const session = await createSession(admin, request);
  await auditAdminEvent({ adminId: admin.id, action: "admin.login.mfa", entityType: "admin", entityId: admin.id, request });
  return session;
}

export async function getAuthSession(request: Request): Promise<AuthSession | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const result = await getPool().query<SessionRow>(
    `SELECT s.id AS session_id, s.token_hash, s.csrf_token_hash, s.reauthenticated_at, s.expires_at,
            a.id AS admin_id, a.email, a.display_name, a.status, a.mfa_enabled,
            r.name AS role_name,
            COALESCE(array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL), ARRAY[]::text[]) AS permissions
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       JOIN roles r ON r.id = a.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - ($2::int * interval '1 minute')
      GROUP BY s.id, a.id, r.name`,
    [sha256Hex(token), parseServerEnv(process.env).ADMIN_SESSION_IDLE_MINUTES],
  );
  const row = result.rows[0];
  if (!row || row.status !== "active" || !row.csrf_token_hash) return null;
  void getPool().query(`UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1::uuid`, [row.session_id]).catch(() => {});
  return {
    id: row.session_id,
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    reauthenticatedAt: row.reauthenticated_at,
    expiresAt: row.expires_at,
    principal: principalFrom(row),
  };
}

export async function requireAdmin(request: Request, permission?: string) {
  const session = await getAuthSession(request);
  if (!session) throw new ApiError(401, "unauthenticated", "Sign in is required.");
  if (permission && session.principal.role !== "super_admin" && !session.principal.permissions.includes(permission)) {
    throw new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }
  return session;
}

export function requireCsrf(request: Request, session: AuthSession) {
  const env = parseServerEnv(process.env);
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(env.APP_BASE_URL).origin;
  if ((env.APP_ENV === "production" && !origin) || (origin && origin !== expectedOrigin)) {
    throw new ApiError(403, "csrf_origin_failed", "The request origin could not be verified.");
  }
  const cookieToken = parseCookies(request).get(CSRF_COOKIE);
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken || sha256Hex(cookieToken) !== session.csrfTokenHash) {
    throw new ApiError(403, "csrf_failed", "The request could not be verified.");
  }
}

export function requireRecentReauthentication(session: AuthSession, options?: { allowMfaEnrollment?: boolean }) {
  const env = parseServerEnv(process.env);
  if (env.REQUIRE_MFA_FOR_PRIVILEGED_ACTIONS && !session.principal.mfaEnabled && !options?.allowMfaEnrollment) {
    throw new ApiError(403, "mfa_required", "Enable MFA before performing this privileged action.");
  }
  const at = session.reauthenticatedAt?.getTime() ?? 0;
  if (Date.now() - at > env.ADMIN_REAUTH_MINUTES * 60_000) {
    throw new ApiError(403, "reauthentication_required", "Recent reauthentication is required for this action.");
  }
}

export async function reauthenticate(session: AuthSession, password: string, totpCode: string | undefined, request: Request, requestId?: string) {
  const result = await getPool().query<{ password_hash: string | null; mfa_enabled: boolean; mfa_secret_encrypted: string | null }>(
    `SELECT password_hash, mfa_enabled, mfa_secret_encrypted FROM admins WHERE id = $1::uuid AND status = 'active'`,
    [session.principal.id],
  );
  const admin = result.rows[0];
  if (!admin?.password_hash || !(await verifyPassword(password, admin.password_hash))) {
    throw new ApiError(401, "invalid_credentials", "Password is incorrect.");
  }
  if (admin.mfa_enabled) {
    if (!admin.mfa_secret_encrypted || !totpCode || !verifyTotp(decryptSecret(admin.mfa_secret_encrypted), totpCode)) {
      throw new ApiError(401, "invalid_mfa_code", "A valid MFA code is required.");
    }
  }
  await getPool().query(`UPDATE admin_sessions SET reauthenticated_at = now() WHERE id = $1::uuid`, [session.id]);
  await auditAdminEvent({ adminId: session.principal.id, action: "admin.reauthenticate", entityType: "admin_session", entityId: session.id, request, requestId });
}

export async function revokeSession(session: AuthSession, request: Request, requestId?: string) {
  await getPool().query(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1::uuid`, [session.id]);
  await auditAdminEvent({ adminId: session.principal.id, action: "admin.logout", entityType: "admin_session", entityId: session.id, request, requestId });
}

export async function setupMfa(session: AuthSession, request: Request, requestId?: string) {
  requireRecentReauthentication(session, { allowMfaEnrollment: true });
  const secret = generateTotpSecret();
  await getPool().query(
    `UPDATE admins SET mfa_secret_encrypted = $2, mfa_enabled = false, mfa_confirmed_at = NULL, updated_at = now() WHERE id = $1::uuid`,
    [session.principal.id, encryptSecret(secret)],
  );
  await auditAdminEvent({ adminId: session.principal.id, action: "admin.mfa.setup", entityType: "admin", entityId: session.principal.id, request, requestId });
  return { secret, otpauthUri: buildTotpUri(secret, session.principal.email) };
}

export async function enableMfa(session: AuthSession, code: string, request: Request, requestId?: string) {
  const result = await getPool().query<{ mfa_secret_encrypted: string | null }>(
    `SELECT mfa_secret_encrypted FROM admins WHERE id = $1::uuid`,
    [session.principal.id],
  );
  const encrypted = result.rows[0]?.mfa_secret_encrypted;
  if (!encrypted || !verifyTotp(decryptSecret(encrypted), code)) {
    throw new ApiError(400, "invalid_mfa_code", "The authentication code is invalid.");
  }
  await getPool().query(`UPDATE admins SET mfa_enabled = true, mfa_confirmed_at = now(), updated_at = now() WHERE id = $1::uuid`, [session.principal.id]);
  await auditAdminEvent({ adminId: session.principal.id, action: "admin.mfa.enable", entityType: "admin", entityId: session.principal.id, request, requestId });
}

export async function disableMfa(session: AuthSession, code: string, request: Request, requestId?: string) {
  requireRecentReauthentication(session);
  const result = await getPool().query<{ mfa_secret_encrypted: string | null; mfa_enabled: boolean }>(
    `SELECT mfa_secret_encrypted, mfa_enabled FROM admins WHERE id = $1::uuid`,
    [session.principal.id],
  );
  const row = result.rows[0];
  if (!row?.mfa_enabled || !row.mfa_secret_encrypted || !verifyTotp(decryptSecret(row.mfa_secret_encrypted), code)) {
    throw new ApiError(400, "invalid_mfa_code", "A valid MFA code is required.");
  }
  await getPool().query(`UPDATE admins SET mfa_enabled = false, mfa_secret_encrypted = NULL, mfa_confirmed_at = NULL, updated_at = now() WHERE id = $1::uuid`, [session.principal.id]);
  await auditAdminEvent({ adminId: session.principal.id, action: "admin.mfa.disable", entityType: "admin", entityId: session.principal.id, request, requestId });
}

export function currentMfaChallenge(request: Request) {
  return parseCookies(request).get(MFA_CHALLENGE_COOKIE) ?? null;
}
