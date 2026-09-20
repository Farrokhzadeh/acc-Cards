"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mfaRequired ? "/api/v1/auth/mfa" : "/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(mfaRequired ? { code } : { email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message ?? "Sign in failed.");
      if (body?.data?.mfaRequired) {
        setMfaRequired(true);
        setCode("");
        return;
      }
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6fa] p-5 text-[#302d43]">
      <div className="w-full max-w-[430px] rounded-[28px] border border-[#e7e4ed] bg-white p-8 shadow-[0_24px_80px_rgba(41,35,78,.10)]">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#6157e7] text-white"><ShieldCheck className="size-5" /></span><div><h1 className="text-xl font-semibold tracking-[-.03em]">AccAbad Admin</h1><p className="text-sm text-[#9692a3]">Secure operator access</p></div></div>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {!mfaRequired ? <>
            <label className="block text-sm font-medium">Email<input className="mt-2 h-11 w-full rounded-xl border border-[#dedbe6] px-3 outline-none focus:border-[#8f87ed]" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block text-sm font-medium">Password<input className="mt-2 h-11 w-full rounded-xl border border-[#dedbe6] px-3 outline-none focus:border-[#8f87ed]" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </> : <label className="block text-sm font-medium">Authentication code<input className="mt-2 h-12 w-full rounded-xl border border-[#dedbe6] px-3 text-center font-mono text-lg tracking-[.35em] outline-none focus:border-[#8f87ed]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /><span className="mt-2 block text-xs text-[#9692a3]">Enter the 6-digit code from your authenticator app.</span></label>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6157e7] font-semibold text-white transition hover:bg-[#554bcf] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{mfaRequired ? "Verify & sign in" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#aaa6b8]">Sessions are server-side, protected with HttpOnly cookies, CSRF validation, rate limiting, and audit logging.</p>
      </div>
    </main>
  );
}
