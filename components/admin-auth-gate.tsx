"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { fetchCurrentAdmin } from "@/lib/auth-client";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentAdmin(controller.signal)
      .then((admin) => {
        if (!admin) {
          window.location.replace("/login");
          return;
        }
        setAllowed(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Authentication check failed.");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f6fa] p-6"><div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm"><ShieldCheck className="mx-auto size-8 text-red-500" /><h1 className="mt-3 text-lg font-semibold">Unable to verify your session</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></div>;
  }
  if (!allowed) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f6fa]"><div className="flex items-center gap-3 text-sm text-slate-500"><ShieldCheck className="size-5 animate-pulse text-[#6157e7]" />Verifying secure admin session…</div></div>;
  }
  return <>{children}</>;
}
