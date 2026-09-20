import { jsonData } from "@/server/http/api";
import { csrfCookie, sessionCookie, mfaChallengeCookie, clearMfaChallengeCookie, clearCsrfCookie, clearSessionCookie } from "@/server/auth/cookies";

export function authenticatedResponse(data: unknown, requestId: string, sessionToken: string, csrfToken: string, maxAgeSeconds: number) {
  const response = jsonData(data, requestId);
  response.headers.append("set-cookie", sessionCookie(sessionToken, maxAgeSeconds));
  response.headers.append("set-cookie", csrfCookie(csrfToken, maxAgeSeconds));
  response.headers.append("set-cookie", clearMfaChallengeCookie());
  return response;
}

export function mfaChallengeResponse(data: unknown, requestId: string, token: string, maxAgeSeconds: number) {
  const response = jsonData(data, requestId);
  response.headers.append("set-cookie", mfaChallengeCookie(token, maxAgeSeconds));
  return response;
}

export function loggedOutResponse(data: unknown, requestId: string) {
  const response = jsonData(data, requestId);
  response.headers.append("set-cookie", clearSessionCookie());
  response.headers.append("set-cookie", clearCsrfCookie());
  response.headers.append("set-cookie", clearMfaChallengeCookie());
  return response;
}
