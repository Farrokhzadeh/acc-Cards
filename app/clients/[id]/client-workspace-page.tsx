"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bell,
  CreditCard,
  Plus,
  FileText,
  MessageSquare,
  Paperclip,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { AdminAttachmentViewer, openAdminAttachment } from "@/components/admin/attachment-viewer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  AdminApiError,
  assignClientAccount,
  createAdminDirectCard,
  customerPaymentReceiptUrl,
  fetchAdminDirectCardOptions,
  fetchClientKyc,
  fetchClientPayments,
  fetchClientSupportMessages,
  fetchClientWorkspace,
  kycDocumentUrl,
  notifyClient,
  reauthenticateAdmin,
  sendClientSupportMessage,
  setClientBanned,
  unassignClientAccount,
  type AdminDirectCardOptions,
  type ApiCustomerPaymentHistory,
  type ClientKyc,
  type ClientWorkspace,
  type StoredSupportMessage,
} from "@/lib/admin-api";

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CL";
}

function usdFromCents(value: string | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusBadge(status: string | null | undefined) {
  const value = status ?? "unknown";
  const ok = ["active", "approved", "accepted", "completed", "issued", "complete", "connected", "clean", "delivered"].includes(value);
  const bad = ["rejected", "cancelled", "failed", "closed", "expired", "denied", "banned"].includes(value);
  const cls = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : bad
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return <Badge variant="outline" className={`rounded-full ${cls}`}>{value.replaceAll("_", " ")}</Badge>;
}

function SectionError({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{text}</div>;
}

export default function ClientWorkspacePage({ clientId }: { clientId: string }) {
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [kyc, setKyc] = useState<ClientKyc>(null);
  const [payments, setPayments] = useState<ApiCustomerPaymentHistory[]>([]);
  const [messages, setMessages] = useState<StoredSupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [supportDraft, setSupportDraft] = useState("");
  const [supportFile, setSupportFile] = useState<File | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [directCardOpen, setDirectCardOpen] = useState(false);
  const [directOptions, setDirectOptions] = useState<AdminDirectCardOptions | null>(null);
  const [directBusy, setDirectBusy] = useState(false);
  const [directAccountId, setDirectAccountId] = useState("");
  const [directBin, setDirectBin] = useState("");
  const [directAmount, setDirectAmount] = useState("25");
  const [directName, setDirectName] = useState("");
  const [directEmail, setDirectEmail] = useState("");
  const [directDob, setDirectDob] = useState("");
  const [walletConfirmed, setWalletConfirmed] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthCode, setReauthCode] = useState("");
  const [pendingDirectRetry, setPendingDirectRetry] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchClientWorkspace(clientId)
      .then(async (data) => {
        if (cancelled) return;
        setWorkspace(data);

        const [kycResult, paymentResult, messageResult] = await Promise.allSettled([
          fetchClientKyc(clientId),
          fetchClientPayments(clientId),
          fetchClientSupportMessages(clientId, { limit: 500 }),
        ]);
        if (cancelled) return;

        if (kycResult.status === "fulfilled") {
          setKyc(kycResult.value.kyc);
          setKycError(null);
        } else {
          setKyc(null);
          setKycError(kycResult.reason instanceof Error ? kycResult.reason.message : "KYC data is unavailable.");
        }

        if (paymentResult.status === "fulfilled") {
          setPayments(paymentResult.value.items);
          setPaymentsError(null);
        } else {
          setPayments([]);
          setPaymentsError(paymentResult.reason instanceof Error ? paymentResult.reason.message : "Payment history is unavailable.");
        }

        if (messageResult.status === "fulfilled") {
          setMessages(messageResult.value.items);
          setMessagesError(null);
        } else {
          setMessages([]);
          setMessagesError(messageResult.reason instanceof Error ? messageResult.reason.message : "Support history is unavailable.");
        }

        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setFatalError(error instanceof Error ? error.message : "Could not load this customer.");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId]);

  const financialActivity = useMemo(() => {
    const paymentItems = payments.map((payment) => ({
      id: `payment:${payment.id}`,
      kind: "payment" as const,
      at: payment.createdAt,
      title: payment.purpose === "first_card" ? "First-card payment" : payment.purpose === "additional_card" ? "Additional-card payment" : "Card funding payment",
      status: payment.status,
      payment,
    }));
    const providerItems = (workspace?.transactions ?? []).map((transaction) => ({
      id: `transaction:${transaction.id}`,
      kind: "provider" as const,
      at: transaction.occurredAt,
      title: transaction.merchant || transaction.type || "Card transaction",
      status: transaction.status,
      transaction,
    }));
    return [...paymentItems, ...providerItems].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [payments, workspace?.transactions]);

  const requests = useMemo(() => {
    const card = (workspace?.cardRequests ?? []).map((request) => ({
      id: `card:${request.id}`,
      kind: "card" as const,
      at: request.createdAt,
      reference: request.reference,
      status: request.status,
      origin: request.origin,
      amountUsdCents: request.amountUsdCents,
      cardLast4: null as string | null,
      note: request.adminNote,
    }));
    const funding = (workspace?.fundingRequests ?? []).map((request) => ({
      id: `funding:${request.id}`,
      kind: "funding" as const,
      at: request.createdAt,
      reference: request.reference,
      status: request.status,
      origin: null as null,
      amountUsdCents: request.amountUsdCents,
      cardLast4: request.cardLast4,
      note: null as string | null,
    }));
    return [...card, ...funding].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [workspace]);

  const refreshWorkspace = async () => {
    const data = await fetchClientWorkspace(clientId);
    setWorkspace(data);
    return data;
  };

  const loadDirectOptions = async () => {
    const options = await fetchAdminDirectCardOptions(clientId);
    setDirectOptions(options);
    const preferred = options.accounts.find((account) => account.selected) ?? options.accounts[0] ?? null;
    setDirectAccountId((current) => current || preferred?.id || "");
    setDirectBin((current) => current || options.bins[0]?.bin || "");
    setDirectName((current) => current || options.defaults.nameOnCard);
    setDirectDob((current) => current || options.defaults.dateOfBirth || "");
    return options;
  };

  const openDirectCard = async () => {
    setDirectCardOpen(true);
    try {
      await loadDirectOptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load direct card options.");
    }
  };

  const submitDirectCard = async () => {
    if (directBusy) return;
    const amountUsdCents = Math.round(Number(directAmount) * 100);
    if (!directAccountId || !directBin || !directName.trim() || !directEmail.trim() || !Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
      toast.error("Choose an account and BIN, then enter a valid amount, cardholder name, and email.");
      return;
    }
    setDirectBusy(true);
    try {
      const result = await createAdminDirectCard(clientId, {
        accountId: directAccountId,
        bin: directBin,
        amountUsdCents,
        nameOnCard: directName.trim(),
        email: directEmail.trim(),
        dateOfBirth: directDob.trim() || null,
        walletFundingConfirmed: walletConfirmed,
      });
      await refreshWorkspace();
      setDirectCardOpen(false);
      setWalletConfirmed(false);
      toast.success(result.status === "issued" ? `Card created directly (${result.reference}).` : `Provider outcome needs reconciliation (${result.reference}).`);
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "reauthentication_required") {
        setPendingDirectRetry(true);
        setReauthOpen(true);
      } else {
        toast.error(error instanceof Error ? error.message : "Direct card creation failed.");
      }
    } finally {
      setDirectBusy(false);
    }
  };

  const submitReauth = async () => {
    if (!reauthPassword.trim()) return;
    setDirectBusy(true);
    try {
      await reauthenticateAdmin(reauthPassword, reauthCode.trim() || undefined);
      setReauthOpen(false);
      setReauthPassword("");
      setReauthCode("");
      const shouldRetry = pendingDirectRetry;
      setPendingDirectRetry(false);
      setDirectBusy(false);
      if (shouldRetry) {
        queueMicrotask(() => { void submitDirectCard(); });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
      setDirectBusy(false);
    }
  };

  const changeAccountAssignment = async (accountId: string, selected: boolean) => {
    setDirectBusy(true);
    try {
      if (selected) await unassignClientAccount(clientId, accountId);
      else await assignClientAccount(clientId, accountId);
      await Promise.all([refreshWorkspace(), loadDirectOptions()]);
      toast.success(selected ? "Provider account unassigned." : "Provider account assigned.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account assignment failed.");
    } finally {
      setDirectBusy(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("createCard") !== "1") return;
    const preferredAccountId = searchParams.get("accountId") ?? "";
    let cancelled = false;
    fetchAdminDirectCardOptions(clientId)
      .then((options) => {
        if (cancelled) return;
        setDirectOptions(options);
        setDirectAccountId(preferredAccountId || options.accounts.find((account) => account.selected)?.id || options.accounts[0]?.id || "");
        setDirectBin(options.bins[0]?.bin || "");
        setDirectName(options.defaults.nameOnCard);
        setDirectDob(options.defaults.dateOfBirth || "");
        setDirectCardOpen(true);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load direct card options.");
      });
    return () => { cancelled = true; };
  }, [clientId, searchParams]);

  const handleBan = async () => {
    if (!workspace || actionBusy) return;
    setActionBusy(true);
    try {
      const result = await setClientBanned(clientId, !workspace.client.banned);
      setWorkspace((current) => current ? { ...current, client: { ...current.client, banned: result.banned, bannedAt: result.bannedAt } } : current);
      toast.success(result.banned ? "Customer banned." : "Customer unbanned.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update customer access.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleNotify = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await notifyClient(clientId);
      toast.success("Notification queued for Telegram.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not notify customer.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSupportSend = async () => {
    if (supportBusy || (!supportDraft.trim() && !supportFile)) return;
    setSupportBusy(true);
    try {
      await sendClientSupportMessage(clientId, supportDraft.trim(), supportFile);
      setSupportDraft("");
      setSupportFile(null);
      const refreshed = await fetchClientSupportMessages(clientId, { limit: 500 });
      setMessages(refreshed.items);
      toast.success("Support message queued.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send support message.");
    } finally {
      setSupportBusy(false);
    }
  };

  if (loading && !workspace) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f7fb]"><div className="flex items-center gap-2 text-sm text-[#777287]"><RefreshCw className="size-4 animate-spin" />Loading customer workspace…</div></div>;
  }

  if (fatalError || !workspace) {
    return <div className="min-h-screen bg-[#f7f7fb] p-6"><div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm"><h1 className="text-lg font-semibold">Customer unavailable</h1><p className="mt-2 text-sm text-slate-500">{fatalError ?? "Customer not found."}</p><Link href="/#clients" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#6157e7]"><ArrowLeft className="size-4" />Back to clients</Link></div></div>;
  }

  const clientName = workspace.client.displayName || workspace.client.username || `Telegram ${workspace.client.telegramUserId}`;

  return (
    <div className="min-h-screen bg-[#f7f7fb] text-[#302d43]">
      <AdminAttachmentViewer />
      <Toaster />
      <header className="sticky top-0 z-20 border-b border-[#e9e7ef] bg-[#f7f7fb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-4 md:px-8">
          <Button asChild variant="outline" size="sm" className="rounded-xl"><Link href="/#clients"><ArrowLeft className="size-4" />Clients</Link></Button>
          <Avatar className="size-11"><AvatarFallback className="bg-[#eeecff] font-bold text-[#5b50d6]">{initials(clientName)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-[-.03em]">{clientName}</h1>
              {workspace.client.banned ? statusBadge("banned") : statusBadge("active")}
              {workspace.client.onboardingStatus && statusBadge(workspace.client.onboardingStatus)}
            </div>
            <p className="mt-0.5 text-sm text-[#8f8b9c]">{workspace.client.username ? `@${workspace.client.username.replace(/^@/, "")} · ` : ""}Telegram {workspace.client.telegramUserId} · joined {formatDate(workspace.client.joinedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={directBusy} onClick={() => void openDirectCard()}><Plus className="size-4" />Create card</Button>
            <Button variant="outline" className="rounded-xl" disabled={actionBusy} onClick={() => void handleNotify()}><Bell className="size-4" />Notify</Button>
            <Button variant="outline" className={`rounded-xl ${workspace.client.banned ? "text-emerald-700" : "text-red-700"}`} disabled={actionBusy} onClick={() => void handleBan()}><Ban className="size-4" />{workspace.client.banned ? "Unban" : "Ban"}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <Tabs defaultValue="overview">
          <TabsList className="mb-5 h-auto flex-wrap justify-start rounded-[16px] border bg-white p-1.5 shadow-sm">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="cards">Cards <Badge variant="outline" className="ml-1.5 rounded-full">{workspace.cards.length}</Badge></TabsTrigger>
            <TabsTrigger value="financial">Financial activity <Badge variant="outline" className="ml-1.5 rounded-full">{financialActivity.length}</Badge></TabsTrigger>
            <TabsTrigger value="requests">Requests <Badge variant="outline" className="ml-1.5 rounded-full">{requests.length}</Badge></TabsTrigger>
            <TabsTrigger value="kyc">KYC</TabsTrigger>
            <TabsTrigger value="support">Support <Badge variant="outline" className="ml-1.5 rounded-full">{messages.length}</Badge></TabsTrigger>
            <TabsTrigger value="activity">Admin activity <Badge variant="outline" className="ml-1.5 rounded-full">{workspace.adminActivity.length}</Badge></TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-[22px]"><CardContent className="p-5"><p className="text-sm text-[#8f8b9c]">Card balance</p><p className="mt-1 text-2xl font-bold">{usdFromCents(workspace.client.totalCardBalanceUsdCents)}</p></CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-5"><p className="text-sm text-[#8f8b9c]">Completed funding</p><p className="mt-1 text-2xl font-bold">{usdFromCents(workspace.client.totalFundedUsdCents)}</p></CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-5"><p className="text-sm text-[#8f8b9c]">Cards</p><p className="mt-1 text-2xl font-bold">{workspace.cards.length}</p></CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-5"><p className="text-sm text-[#8f8b9c]">Last seen</p><p className="mt-1 text-base font-semibold">{formatDate(workspace.client.lastSeenAt)}</p></CardContent></Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="rounded-[22px]">
                <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle className="text-base">Internal account assignments</CardTitle><Button size="sm" variant="outline" onClick={() => { setAccountManagerOpen(true); void loadDirectOptions(); }}>Manage accounts</Button></CardHeader>
                <CardContent className="space-y-2">
                  {workspace.accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border bg-[#faf9fc] p-3"><div><p className="font-semibold">{account.label}</p><p className="text-xs text-[#9692a3]">{account.loginEmail} · assigned {formatDate(account.assignedAt)}</p></div>{statusBadge(account.status)}</div>)}
                  {!workspace.accounts.length && <p className="rounded-xl border border-dashed p-4 text-sm text-[#9692a3]">No internal provider account is assigned yet.</p>}
                </CardContent>
              </Card>

              <Card className="rounded-[22px]">
                <CardHeader><CardTitle className="text-base">Customer status</CardTitle></CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[#9692a3]">KYC</p><div className="mt-1">{kyc ? statusBadge(kyc.status) : <span>Not submitted</span>}</div></div>
                  <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[#9692a3]">Onboarding</p><div className="mt-1">{statusBadge(workspace.client.onboardingStatus ?? "not started")}</div></div>
                  <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[#9692a3]">Card requests</p><p className="mt-1 font-semibold">{workspace.cardRequests.length}</p></div>
                  <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[#9692a3]">Funding requests</p><p className="mt-1 font-semibold">{workspace.fundingRequests.length}</p></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cards">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {workspace.cards.map((card) => (
                <Card key={card.id} className="rounded-[22px]">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eeecff] text-[#6157e7]"><CreditCard className="size-5" /></span><div><CardTitle className="text-base">{card.label || "Card"} · •{card.last4 ?? "????"}</CardTitle><p className="mt-1 text-xs text-[#9692a3]">{card.accountLabel}</p></div></div>
                      {statusBadge(card.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-xs text-[#9692a3]">Balance</p><p className="mt-1 font-semibold">{usdFromCents(card.balanceUsdCents)}</p></div>
                      <div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-xs text-[#9692a3]">Expiry</p><p className="mt-1 font-semibold">{card.expiryMonth && card.expiryYear ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}` : "—"}</p></div>
                    </div>
                    <p><span className="text-[#9692a3]">BIN:</span> {card.bin ?? "—"}</p>
                    <p><span className="text-[#9692a3]">Cardholder:</span> {card.cardholderName ?? "—"}</p>
                    <p><span className="text-[#9692a3]">Card email:</span> {card.cardEmail ?? "—"}</p>
                    <p className="break-all text-xs text-[#777287]">Provider card: {card.providerCardId ?? "not linked"}</p>
                  </CardContent>
                </Card>
              ))}
              {!workspace.cards.length && <Card className="rounded-[22px] lg:col-span-2"><CardContent className="p-8 text-center text-sm text-[#9692a3]">This customer has no cards yet.</CardContent></Card>}
            </div>
          </TabsContent>

          <TabsContent value="financial">
            <SectionError text={paymentsError} />
            <div className="space-y-3">
              {financialActivity.map((item) => item.kind === "payment" ? (
                <Card key={item.id} className="rounded-[20px]">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eeecff] text-[#6157e7]"><ReceiptText className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.title}</p>{statusBadge(item.payment.status)}</div>
                      <p className="mt-1 text-xs text-[#9692a3]">{item.payment.requestReference ?? item.payment.reference} · {formatDate(item.payment.createdAt)}</p>
                      <p className="mt-1 text-sm">USD basis <b>{usdFromCents(item.payment.customerPaysUsdCents)}</b> · customer paid <b>{BigInt(item.payment.customerPaysRial).toLocaleString("en-US")} IRR</b> · rate {BigInt(item.payment.rateRialPerUsd).toLocaleString("en-US")} IRR/USD</p>
                    </div>
                    {item.payment.receipt && <Button variant="outline" size="sm" onClick={() => openAdminAttachment({ url: customerPaymentReceiptUrl(item.payment.id), title: `Payment receipt · ${item.payment.requestReference ?? item.payment.reference}`, filename: `${item.payment.reference}-receipt`, mimeType: item.payment.receipt?.mimeType })}><Paperclip className="size-4" />Receipt</Button>}
                  </CardContent>
                </Card>
              ) : (
                <Card key={item.id} className="rounded-[20px]">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><CreditCard className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.title}</p>{statusBadge(item.transaction.status)}</div>
                      <p className="mt-1 text-xs text-[#9692a3]">Card •{item.transaction.cardLast4 ?? "????"} · {formatDate(item.transaction.occurredAt)} · {item.transaction.type ?? "transaction"}</p>
                    </div>
                    <p className="text-base font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: item.transaction.currency || "USD" }).format(Number(item.transaction.amountMinor) / 100)}</p>
                  </CardContent>
                </Card>
              ))}
              {!financialActivity.length && <Card className="rounded-[22px]"><CardContent className="p-8 text-center text-sm text-[#9692a3]">No financial activity yet.</CardContent></Card>}
            </div>
          </TabsContent>

          <TabsContent value="requests">
            <div className="space-y-3">
              {requests.map((request) => (
                <Card key={request.id} className="rounded-[20px]">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f3f1ff] text-[#6157e7]">{request.kind === "card" ? <CreditCard className="size-5" /> : <WalletCards className="size-5" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{request.kind === "card" ? request.origin === "admin_direct" ? "Admin direct card" : request.origin === "onboarding" ? "Onboarding card" : "Card request" : "Funding request"} · {request.reference}</p>{statusBadge(request.status)}</div>
                      <p className="mt-1 text-sm">{usdFromCents(request.amountUsdCents)}{request.cardLast4 ? ` · card •${request.cardLast4}` : ""}</p>
                      <p className="mt-1 text-xs text-[#9692a3]">{formatDate(request.at)}</p>
                      {request.note && <p className="mt-1 text-xs text-[#777287]">Admin note: {request.note}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!requests.length && <Card className="rounded-[22px]"><CardContent className="p-8 text-center text-sm text-[#9692a3]">No card or funding requests yet.</CardContent></Card>}
            </div>
          </TabsContent>

          <TabsContent value="kyc">
            <SectionError text={kycError} />
            <Card className="rounded-[22px]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRoundCheck className="size-5" />KYC profile</CardTitle></CardHeader>
              <CardContent>
                {kyc ? <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">{statusBadge(kyc.status)}<span className="text-xs text-[#9692a3]">submitted {formatDate(kyc.submittedAt)}</span></div>
                  <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                    <div><p className="text-xs text-[#9692a3]">Full name</p><p className="mt-1 font-semibold">{kyc.fullName}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Date of birth</p><p className="mt-1 font-semibold">{kyc.dateOfBirth ?? "—"}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Country</p><p className="mt-1 font-semibold">{kyc.country}</p></div>
                    <div><p className="text-xs text-[#9692a3]">National ID</p><p className="mt-1 font-semibold">{kyc.nationalId}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Phone</p><p className="mt-1 font-semibold">{kyc.phone}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Delivery country</p><p className="mt-1 font-semibold">{kyc.deliveryCountry ?? "—"}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Province / state</p><p className="mt-1 font-semibold">{kyc.deliveryProvince ?? "—"}</p></div>
                    <div><p className="text-xs text-[#9692a3]">City</p><p className="mt-1 font-semibold">{kyc.deliveryCity ?? "—"}</p></div>
                    <div><p className="text-xs text-[#9692a3]">Postal / ZIP</p><p className="mt-1 font-semibold">{kyc.deliveryPostalCode ?? "—"}</p></div>
                    <div className="md:col-span-2 xl:col-span-3"><p className="text-xs text-[#9692a3]">Card delivery address</p><p className="mt-1 font-semibold">{kyc.deliveryAddressLine ?? "—"}</p><p className="mt-1 text-xs text-[#9692a3]">Collected so the customer’s card can be sent to this address.</p></div>
                  </div>
                  {kyc.reviewNote && <div className="rounded-xl bg-[#faf9fc] p-3 text-sm">Review note: {kyc.reviewNote}</div>}
                  {kyc.hasDocument && <Button variant="outline" onClick={() => openAdminAttachment({ url: kycDocumentUrl(kyc.id), title: `KYC document · ${kyc.fullName}`, filename: "kyc-document", mimeType: kyc.documentMimeType })}><FileText className="size-4" />View document</Button>}
                </div> : <p className="text-sm text-[#9692a3]">No KYC submission found.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="support">
            <SectionError text={messagesError} />
            <Card className="rounded-[22px]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-5" />Telegram support conversation</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-[18px] bg-[#faf9fc] p-4">
                  {messages.map((message) => <div key={message.id} className={message.direction === "admin_to_client" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}><div className={`rounded-[16px] p-3 text-sm ${message.direction === "admin_to_client" ? "bg-[#6157e7] text-white" : "border bg-white"}`}><p className="whitespace-pre-wrap">{message.text}</p>{message.attachment && <button type="button" onClick={() => openAdminAttachment({ url: message.attachment!.downloadUrl, title: `Support attachment · ${message.attachment!.filename}`, filename: message.attachment!.filename, mimeType: message.attachment!.mimeType })} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline"><Paperclip className="size-3.5" />{message.attachment.filename}</button>}</div><p className="mt-1 text-xs text-[#9692a3]">{formatDate(message.createdAt)} · {message.status}</p></div>)}
                  {!messages.length && <p className="py-8 text-center text-sm text-[#9692a3]">No support messages yet.</p>}
                </div>
                <div className="space-y-2">
                  <Textarea value={supportDraft} onChange={(event) => setSupportDraft(event.target.value)} placeholder="Message this customer in Telegram…" className="min-h-24" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#6157e7]"><Paperclip className="size-4" />{supportFile ? supportFile.name : "Attach file"}<Input type="file" className="hidden" onChange={(event) => setSupportFile(event.target.files?.[0] ?? null)} /></label>
                    <Button disabled={supportBusy || (!supportDraft.trim() && !supportFile)} onClick={() => void handleSupportSend()}><Send className="size-4" />{supportBusy ? "Sending…" : "Send"}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="rounded-[22px]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-5" />Admin and system activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {workspace.adminActivity.map((item) => <div key={item.id} className="rounded-xl border bg-[#faf9fc] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{item.action}</p><span className="text-xs text-[#9692a3]">{formatDate(item.createdAt)}</span></div><p className="mt-1 text-xs text-[#777287]">{item.actorType} · {item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}{item.requestId ? ` · request ${item.requestId}` : ""}</p>{Object.keys(item.metadata ?? {}).length > 0 && <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-[11px] text-[#777287]">{JSON.stringify(item.metadata, null, 2)}</pre>}</div>)}
                {!workspace.adminActivity.length && <p className="py-8 text-center text-sm text-[#9692a3]">No audit activity is linked to this customer yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={directCardOpen} onOpenChange={(open) => { setDirectCardOpen(open); if (!open) setWalletConfirmed(false); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[24px] sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Create card directly</DialogTitle>
            <DialogDescription>This is an admin operation. No customer card request or customer payment is required. The selected provider account will be assigned to this customer automatically if needed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Provider account</Label>
              <Select value={directAccountId} onValueChange={setDirectAccountId}>
                <SelectTrigger><SelectValue placeholder="Select provider account" /></SelectTrigger>
                <SelectContent>{directOptions?.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label} · {account.loginEmail}{account.selected ? " · assigned" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>BIN</Label>
              <Select value={directBin} onValueChange={setDirectBin}>
                <SelectTrigger><SelectValue placeholder="Select BIN" /></SelectTrigger>
                <SelectContent>{directOptions?.bins.map((item) => <SelectItem key={item.bin} value={item.bin}>{item.bin}{item.requiresDob ? " · DOB required" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Initial card amount (USD)</Label>
              <Input type="number" min="0.01" step="0.01" value={directAmount} onChange={(event) => setDirectAmount(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Name on card</Label>
              <Input value={directName} onChange={(event) => setDirectName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Card email</Label>
              <Input type="email" value={directEmail} onChange={(event) => setDirectEmail(event.target.value)} placeholder="customer@example.com" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Date of birth</Label>
              <Input type="date" value={directDob} onChange={(event) => setDirectDob(event.target.value)} />
              <p className="text-xs text-[#9692a3]">Required only for BINs marked DOB required. Latest KYC date is prefilled when available.</p>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm sm:col-span-2">
              <Checkbox checked={walletConfirmed} onCheckedChange={(value) => setWalletConfirmed(value === true)} />
              <span>I confirm the selected Kripicard account wallet has enough credited balance for this card creation.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirectCardOpen(false)}>Cancel</Button>
            <Button disabled={directBusy || !walletConfirmed || !directOptions?.accounts.length || !directOptions?.bins.length} onClick={() => void submitDirectCard()}>{directBusy ? "Creating…" : "Create card now"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountManagerOpen} onOpenChange={setAccountManagerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[24px] sm:max-w-[620px]">
          <DialogHeader><DialogTitle>Manage provider accounts</DialogTitle><DialogDescription>Account assignment is an admin operation and does not depend on onboarding or a customer request. An account can belong to only one Telegram customer at a time.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {directOptions?.accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate font-semibold">{account.label}</p><p className="truncate text-xs text-[#9692a3]">{account.loginEmail}</p></div><Button size="sm" variant={account.selected ? "outline" : "default"} disabled={directBusy} onClick={() => void changeAccountAssignment(account.id, account.selected)}>{account.selected ? "Unassign" : "Assign"}</Button></div>)}
            {!directOptions?.accounts.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-[#9692a3]">No available provider accounts.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reauthOpen} onOpenChange={(open) => { if (!directBusy) setReauthOpen(open); }}>
        <DialogContent className="rounded-[24px] sm:max-w-[430px]">
          <DialogHeader><DialogTitle>Confirm live provider action</DialogTitle><DialogDescription>Direct card creation writes to Kripicard. Re-enter your admin credentials, then the exact card operation will continue.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2"><Label>Admin password</Label><Input type="password" autoComplete="current-password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} /></div>
            <div className="grid gap-2"><Label>MFA code <span className="font-normal text-[#9692a3]">(if enabled)</span></Label><Input inputMode="numeric" maxLength={6} value={reauthCode} onChange={(event) => setReauthCode(event.target.value.replace(/\D/g, "").slice(0,6))} /></div>
          </div>
          <DialogFooter><Button variant="outline" disabled={directBusy} onClick={() => setReauthOpen(false)}>Cancel</Button><Button disabled={directBusy || !reauthPassword.trim()} onClick={() => void submitReauth()}>{directBusy ? "Confirming…" : "Confirm & continue"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
