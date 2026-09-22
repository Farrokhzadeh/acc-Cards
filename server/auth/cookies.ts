import { parseServerEnv } from "@/config/env-schema.mjs";

export const SESSION_COOKIE = "accabad_session";
export const CSRF_COOKIE = "accabad_csrf";
export const MFA_CHALLENGE_COOKIE = "accabad_mfa_challenge";

export function parseCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const result = new Map<string, string>();
  for (const chunk of header.split(";")) {
    const index = chunk.indexOf("=");
    if (index < 0) continue;
    const key = chunk.slice(0, index).trim();
    const value = chunk.slice(index + 1).trim();
    if (key) {
      try { result.set(key, decodeURIComponent(value)); } catch {}
    }
  }
  return result;
}

function cookieSecurity() {
  return parseServerEnv(process.env).APP_ENV === "production" ? "; Secure" : "";
}

export function sessionCookie(value: string, maxAgeSeconds: number) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Priority=High; Max-Age=${Math.floor(maxAgeSeconds)}${cookieSecurity()}`;
}

export function csrfCookie(value: string, maxAgeSeconds: number) {
  return `${CSRF_COOKIE}=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Priority=High; Max-Age=${Math.floor(maxAgeSeconds)}${cookieSecurity()}`;
}

export function mfaChallengeCookie(value: string, maxAgeSeconds: number) {
  return `${MFA_CHALLENGE_COOKIE}=${encodeURIComponent(value)}; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Priority=High; Max-Age=${Math.floor(maxAgeSeconds)}${cookieSecurity()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Priority=High; Max-Age=0${cookieSecurity()}`;
}

export function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; SameSite=Strict; Priority=High; Max-Age=0${cookieSecurity()}`;
}

export function clearMfaChallengeCookie() {
  return `${MFA_CHALLENGE_COOKIE}=; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Priority=High; Max-Age=0${cookieSecurity()}`;
}
