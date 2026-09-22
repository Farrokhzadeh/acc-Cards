import { createHash, randomBytes } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { MicrosoftIntegrationError } from "@/server/providers/microsoft/errors";
import { microsoftDeltaSchema, microsoftProfileSchema, microsoftTokenSchema } from "@/server/providers/microsoft/schemas";

export const MICROSOFT_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read"] as const;

function config() {
  const env = parseServerEnv(process.env);
  if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET) {
    throw new MicrosoftIntegrationError(
      "microsoft_not_configured",
      "Microsoft Outlook integration is not configured on this deployment.",
      503,
    );
  }
  return {
    clientId: env.MICROSOFT_OAUTH_CLIENT_ID,
    clientSecret: env.MICROSOFT_OAUTH_CLIENT_SECRET,
    tenant: env.MICROSOFT_OAUTH_TENANT,
    timeoutMs: env.MICROSOFT_GRAPH_TIMEOUT_MS,
  };
}

function identityBase() {
  const { tenant } = config();
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const errorCode = typeof body.error === "string" ? body.error : `http_${response.status}`;
      const authRequired = response.status === 401 || errorCode === "invalid_grant" || errorCode === "interaction_required";
      if (response.status === 410) {
        throw new MicrosoftIntegrationError(
          "microsoft_sync_cursor_expired",
          "The Microsoft inbox synchronization cursor expired and must be rebuilt.",
          409,
          false,
        );
      }
      if (response.status === 429) {
        throw new MicrosoftIntegrationError(
          "microsoft_throttled",
          "Microsoft Graph is temporarily throttling inbox synchronization. Try again later.",
          429,
          false,
        );
      }
      throw new MicrosoftIntegrationError(
        authRequired ? "microsoft_reauth_required" : "microsoft_upstream_error",
        authRequired ? "The Microsoft mailbox authorization is no longer valid. Reconnect the mailbox." : "Microsoft Graph returned an upstream error.",
        authRequired ? 409 : 502,
        authRequired,
      );
    }
    return body;
  } catch (error) {
    if (error instanceof MicrosoftIntegrationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MicrosoftIntegrationError("microsoft_timeout", "Microsoft Graph timed out.", 504);
    }
    throw new MicrosoftIntegrationError("microsoft_network_error", "Microsoft Graph could not be reached.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildMicrosoftAuthorizationUrl(args: { state: string; redirectUri: string; codeChallenge: string }) {
  const { clientId } = config();
  const url = new URL(`${identityBase()}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const { clientId, clientSecret, timeoutMs } = config();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  const body = await requestJson(`${identityBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: params.toString(),
  }, timeoutMs);
  return microsoftTokenSchema.parse(body);
}

export async function exchangeMicrosoftAuthorizationCode(args: { code: string; redirectUri: string; codeVerifier: string }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
    scope: MICROSOFT_SCOPES.join(" "),
  });
  return tokenRequest(params);
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES.join(" "),
  });
  return tokenRequest(params);
}

async function graphJson(url: string, accessToken: string) {
  const { timeoutMs } = config();
  const parsed = new URL(url);
  if (parsed.origin !== "https://graph.microsoft.com") {
    throw new MicrosoftIntegrationError("invalid_graph_url", "Stored Microsoft synchronization state is invalid.", 500);
  }
  return requestJson(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  }, timeoutMs);
}

export async function getMicrosoftProfile(accessToken: string) {
  const body = await graphJson("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", accessToken);
  return microsoftProfileSchema.parse(body);
}

export async function getMicrosoftInboxDeltaPage(accessToken: string, cursor?: string | null) {
  const initial = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta");
  initial.searchParams.set("$select", "id,internetMessageId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments");
  initial.searchParams.set("$top", "50");
  const body = await graphJson(cursor ?? initial.toString(), accessToken);
  return microsoftDeltaSchema.parse(body);
}


export async function getMicrosoftMessageText(accessToken: string, id: string) {
  const url = new URL(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("$select", "body");
  const body = await graphJson(url.toString(), accessToken) as { body?: { contentType?: string; content?: string } };
  const content = body.body?.content ?? "";
  if ((body.body?.contentType ?? "").toLowerCase() === "html") {
    return content.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 100_000);
  }
  return content.replace(/\s+/g, " ").trim().slice(0, 100_000);
}
