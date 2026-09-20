export type CurrentAdmin = {
  id: string;
  email: string;
  displayName: string;
  role: "super_admin" | "operator" | "finance_reviewer";
  permissions: string[];
  mfaEnabled: boolean;
};

type Envelope<T> = { data: T };

export async function fetchCurrentAdmin(signal?: AbortSignal) {
  const response = await fetch("/api/v1/auth/me", { cache: "no-store", signal, headers: { accept: "application/json" } });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Authentication check failed with HTTP ${response.status}.`);
  const body = await response.json() as Envelope<{ admin: CurrentAdmin }>;
  return body.data.admin;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  return document.cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export async function logoutAdmin() {
  const csrf = readCookie("accabad_csrf");
  await fetch("/api/v1/auth/logout", { method: "POST", headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {} });
  window.location.replace("/login");
}

async function authPost<T>(url: string, body: unknown = {}) {
  const csrf = readCookie("accabad_csrf");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  return payload.data as T;
}

export function setupAdminMfa() {
  return authPost<{ secret: string; otpauthUri: string }>("/api/v1/auth/mfa/setup");
}

export function enableAdminMfa(code: string) {
  return authPost<{ ok: true }>("/api/v1/auth/mfa/enable", { code });
}

export function disableAdminMfa(code: string) {
  return authPost<{ ok: true }>("/api/v1/auth/mfa/disable", { code });
}
