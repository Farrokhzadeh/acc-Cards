import { createHash, randomBytes } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { GoogleIntegrationError } from "@/server/providers/google/errors";
import {
  gmailHistoryListSchema,
  gmailMessageListSchema,
  gmailMessageSchema,
  gmailProfileSchema,
  googleTokenSchema,
} from "@/server/providers/google/schemas";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function config() {
  const env = parseServerEnv(process.env);
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new GoogleIntegrationError("google_not_configured", "Google Gmail integration is not configured on this deployment.", 503);
  }
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    timeoutMs: env.GOOGLE_GMAIL_TIMEOUT_MS,
  };
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options?: { notFoundCode?: string; notFoundMessage?: string },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { error?: string | { errors?: Array<{ reason?: string }> } };
    if (!response.ok) {
      const oauthCode = typeof body.error === "string" ? body.error : undefined;
      const structuredError = typeof body.error === "object" ? body.error : undefined;
      const apiReason = Array.isArray(structuredError?.errors) && typeof structuredError.errors[0]?.reason === "string"
        ? structuredError.errors[0].reason
        : undefined;
      const authRequired = response.status === 401 || oauthCode === "invalid_grant" || apiReason === "authError";
      if (response.status === 404 && options?.notFoundCode) {
        throw new GoogleIntegrationError(options.notFoundCode, options.notFoundMessage ?? "The requested Gmail resource was not found.", 409);
      }
      if (response.status === 429 || apiReason === "rateLimitExceeded" || apiReason === "userRateLimitExceeded") {
        throw new GoogleIntegrationError("gmail_throttled", "Gmail is temporarily throttling mailbox synchronization. Try again later.", 429);
      }
      throw new GoogleIntegrationError(
        authRequired ? "google_reauth_required" : "google_upstream_error",
        authRequired ? "The Google mailbox authorization is no longer valid. Reconnect the Gmail mailbox." : "Google returned an upstream error.",
        authRequired ? 409 : 502,
        authRequired,
      );
    }
    return body;
  } catch (error) {
    if (error instanceof GoogleIntegrationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GoogleIntegrationError("google_timeout", "Google Gmail API timed out.", 504);
    }
    throw new GoogleIntegrationError("google_network_error", "Google Gmail API could not be reached.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export function createGooglePkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthorizationUrl(args: { state: string; redirectUri: string; codeChallenge: string }) {
  const { clientId } = config();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("state", args.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const { clientId, clientSecret, timeoutMs } = config();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  const body = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: params.toString(),
  }, timeoutMs);
  return googleTokenSchema.parse(body);
}

export async function exchangeGoogleAuthorizationCode(args: { code: string; redirectUri: string; codeVerifier: string }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  return tokenRequest(params);
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenRequest(params);
}

function assertGmailUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.origin !== "https://gmail.googleapis.com") {
    throw new GoogleIntegrationError("invalid_gmail_url", "Stored Gmail synchronization state is invalid.", 500);
  }
  return parsed;
}

async function gmailJson(url: string, accessToken: string, options?: { notFoundCode?: string; notFoundMessage?: string }) {
  const { timeoutMs } = config();
  assertGmailUrl(url);
  return requestJson(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
  }, timeoutMs, options);
}

export async function getGmailProfile(accessToken: string) {
  const body = await gmailJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", accessToken);
  return gmailProfileSchema.parse(body);
}

export async function listGmailInboxMessages(accessToken: string, pageToken?: string | null) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("labelIds", "INBOX");
  url.searchParams.set("maxResults", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const body = await gmailJson(url.toString(), accessToken);
  return gmailMessageListSchema.parse(body);
}

export async function getGmailMessageMetadata(accessToken: string, id: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "metadata");
  for (const header of ["From", "To", "Subject", "Message-ID"]) url.searchParams.append("metadataHeaders", header);
  const body = await gmailJson(url.toString(), accessToken, {
    notFoundCode: "gmail_message_not_found",
    notFoundMessage: "The Gmail message is no longer available.",
  });
  return gmailMessageSchema.parse(body);
}

export async function listGmailHistory(accessToken: string, startHistoryId: string, pageToken?: string | null) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("startHistoryId", startHistoryId);
  url.searchParams.set("labelId", "INBOX");
  url.searchParams.set("maxResults", "100");
  for (const type of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) {
    url.searchParams.append("historyTypes", type);
  }
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const body = await gmailJson(url.toString(), accessToken, {
    notFoundCode: "gmail_sync_cursor_expired",
    notFoundMessage: "The Gmail history cursor expired and the Inbox must be fully synchronized again.",
  });
  return gmailHistoryListSchema.parse(body);
}


type GmailFullPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailFullPart[];
};

function decodeGmailBody(data?: string) {
  if (!data) return "";
  try { return Buffer.from(data, "base64url").toString("utf8"); }
  catch { return ""; }
}

function textFromGmailPart(part?: GmailFullPart): string {
  if (!part) return "";
  const own = decodeGmailBody(part.body?.data);
  if (part.mimeType === "text/plain" && own) return own;
  const children = (part.parts ?? []).map(textFromGmailPart).filter(Boolean);
  if (children.length) return children.join("\n");
  if (part.mimeType === "text/html" && own) {
    return own.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&");
  }
  return own;
}

export async function getGmailMessageText(accessToken: string, id: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "full");
  const body = await gmailJson(url.toString(), accessToken, {
    notFoundCode: "gmail_message_not_found",
    notFoundMessage: "The Gmail message is no longer available.",
  }) as { payload?: GmailFullPart };
  return textFromGmailPart(body.payload).replace(/\s+/g, " ").trim().slice(0, 100_000);
}
