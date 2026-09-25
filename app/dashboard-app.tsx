"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Hash,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  MessagesSquare,
  Moon,
  Paperclip,
  PencilLine,
  Plus,
  Radio,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Snowflake,
  Sun,
  Trash2,
  Unlock,
  UserRoundCheck,
  Users,
  Video,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AdminApiError, createAccount, archiveAccount, fetchDashboardSnapshot, reauthenticateAdmin, revealAccountSecrets, updateAccount, verifyAccountConnection, syncAccountCards, fetchAccountCards, type ApiCard, revealLiveCardDetails, syncCardTransactions, fetchCardTransactions, fetchTransactions, fetchTransactionNotificationIssues, reconcileTransactionNotification, setCardFrozenState, refreshCardStatus, connectOutlookMailbox, syncOutlookMailbox, disconnectOutlookMailbox, connectGmailMailbox, syncGmailMailbox, disconnectGmailMailbox, fetchEmailOAuthSetup, type EmailOAuthSetup, fetchAccountEmailMessages, classifyAccountEmail, revealParsedOtp, fetchTrustedEmailRules, createTrustedEmailRule, updateTrustedEmailRule, fetchTelegramBotStatus, configureTelegramWebhook, setTelegramBotToken, clearTelegramBotToken, fetchPaymentCard, updatePaymentCard, fetchFirstCardSettings, updateFirstCardSettings, notifyClient, fetchClientPipeline, type ClientPipelineItem, setClientBanned, fetchClientKyc, type ClientKyc, type ClientPayment, clientReceiptUrl, activateClient, fetchAccountDepositCoins, fetchAccountDepositNetworks, fetchAccountDeposits, createAccountDeposit, refreshAccountDeposit, type AccountDeposit, fetchForceJoinChannels, upsertForceJoinChannel, deleteForceJoinChannel, fetchSupportConversations, updateSupportConversation, retrySupportMessage, fetchClientSupportMessages, sendClientSupportMessage, fetchClientAssignableAccounts, fetchCardRequests, reviewCardRequest, issueCardRequest, reconcileCardRequest, attachExistingCardRequest, reviewCustomerPayment, customerPaymentReceiptUrl, type ApiCardRequest, fetchFundingRequests, reviewFundingRequest, executeFundingRequest, reconcileFundingRequest, resolveFundingRequest, fetchProviderWalletGate, type ProviderWalletGate, fundingReceiptDownloadUrl, fetchFundingSettings, updateFundingSettings, type ApiFundingRequest, type AssignableClientAccount, type LiveCardDetails, type StoredCardTransaction, type StoredEmailMessage, type TelegramBotStatus, fetchProviderReadiness, updateProviderReadinessCheck, type ProviderReadinessSnapshot, type TransactionNotificationIssue, type SupportConversationSummary, fetchOperationalSnapshot, updateOperationalAlert, updateRuntimeControl, type OperationalSnapshot, fetchKycSubmissions, reviewKycSubmission, kycDocumentUrl, type ApiKycSubmission } from "@/lib/admin-api";
import { disableAdminMfa, enableAdminMfa, fetchCurrentAdmin, logoutAdmin, setupAdminMfa, type CurrentAdmin } from "@/lib/auth-client";

import { AdminAttachmentViewer, openAdminAttachment } from "@/components/admin/attachment-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationEllipsis,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type View =
  | "overview"
  | "accounts"
  | "clients"
  | "requests"
  | "inbox"
  | "operations"
  | "settings";

type Account = {
  id: string;
  name: string;
  owner: string;
  mailbox: string;
  password: string;
  keyHint: string;
  mailProvider: "Outlook / Hotmail" | "Gmail";
  accountBalance: number | null;
  accountBalanceSource: "unavailable" | "provider" | "derived";
  cardBalance: number;
  cards: number;
  status: "Connected" | "Attention";
  lastSync: string;
  emailConnectionStatus: "not_connected" | "connected" | "reauth_required" | "error" | "disabled";
  emailProviderIdentity: string | null;
  emailLastSyncedAt: string | null;
  emailError: string | null;
};

type ClientCard = {
  id: string;
  providerCardId?: string | null;
  accountId: string;
  bin: string;
  cardholder: string;
  email: string;
  last4: string;
  label: string;
  balance: number;
  frozen: boolean;
  expiry: string;
};

type Client = {
  id: string;
  name: string;
  username: string;
  telegramId: string;
  accountIds: string[];
  joined: string;
  banned: boolean;
  totalFunded: number;
};

type AccountEmail = {
  id: string;
  accountId: string;
  category: "3DS" | "Security" | "Account" | "Quarantine";
  sender: string;
  subject: string;
  preview: string;
  body: string;
  received: string;
  cardLast4?: string;
  unread: boolean;
  classificationStatus: string;
  parserNote: string | null;
  otpAvailable: boolean;
  otpDeliveryStatus: string | null;
  otpCodeLast2: string | null;
  otpExpiresAt: string | null;
};

type FundingStatus = "pending_receipt" | "pending_review" | "correction_needed" | "accepted" | "funding" | "funding_failed" | "needs_reconciliation" | "completed" | "rejected" | "cancelled";

type FundingRequest = {
  id: string;
  reference?: string;
  clientId: string;
  cardLast4: string;
  accountId: string;
  amount: number;
  providerFee: number;
  serviceFee: number;
  rialTotal: number;
  receipt: string;
  receiptType: "image" | "pdf" | "video" | "text";
  receiptScanStatus?: string | null;
  adminNote?: string | null;
  serviceFeeBasisPoints?: number;
  rateRialPerUsd?: number | null;
  status: FundingStatus;
  submitted: string;
};


type Transaction = {
  id: string;
  clientId: string | null;
  accountId: string;
  cardLast4: string;
  merchant: string;
  amount: number;
  type: string;
  status: string;
  date: string;
  notificationStatus?: string;
  notificationError?: string | null;
};

type Message = {
  id: string;
  from: "client" | "admin";
  body: string;
  time: string;
  day?: string;
  status?: string;
  lastDeliveryError?: string | null;
  attachment?: { filename: string; downloadUrl?: string | null; mimeType?: string | null } | null;
};









const fundingMeta: Record<FundingStatus, { label: string; color: string; step: number }> = {
  pending_receipt: { label: "Waiting for receipt", color: "amber", step: 0 },
  pending_review: { label: "Awaiting review", color: "amber", step: 1 },
  correction_needed: { label: "Correction needed", color: "amber", step: 1 },
  accepted: { label: "Payment accepted", color: "blue", step: 2 },
  funding: { label: "Funding in progress", color: "violet", step: 3 },
  funding_failed: { label: "Funding failed", color: "red", step: 3 },
  needs_reconciliation: { label: "Needs reconciliation", color: "amber", step: 3 },
  completed: { label: "Completed", color: "green", step: 4 },
  rejected: { label: "Rejected", color: "red", step: 0 },
  cancelled: { label: "Cancelled", color: "red", step: 0 },
};

const navItems: { view: View; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "accounts", label: "Accounts", icon: WalletCards },
  { view: "clients", label: "Clients", icon: Users },
  { view: "requests", label: "Requests", icon: ReceiptText },
  { view: "inbox", label: "Inbox", icon: MessagesSquare },
  { view: "operations", label: "Operations", icon: Activity },
  { view: "settings", label: "Settings", icon: Settings2 },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Card operations across every connected account." },
  accounts: { title: "Kripicard accounts", description: "API connections, card funding, and card exposure." },
  clients: { title: "Telegram clients", description: "Account assignments, cards, access, and activity." },
  requests: { title: "Requests", description: "Review add-funds requests, KYC, and transaction issues." },
  inbox: { title: "Client inbox", description: "Handle Telegram support without leaving the console." },
  operations: { title: "Operations", description: "Audit, worker health, sync lag, and operational alerts." },
  settings: { title: "Settings", description: "Pricing, exchange rate, bot access, and 3DS routing." },
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatOptionalUsd(value: number | null) {
  return value == null ? "—" : formatUsd(value);
}

function centsToUsd(value: string | null) {
  return value == null ? null : Number(value) / 100;
}

function formatApiDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


function mapStoredEmailMessage(accountId: string, message: StoredEmailMessage): AccountEmail {
  const category: AccountEmail["category"] = message.category === "otp_3ds" ? "3DS" : message.category === "security" ? "Security" : message.category === "quarantined" ? "Quarantine" : "Account";
  return {
    id: message.id,
    accountId,
    category,
    sender: message.sender,
    subject: message.subject,
    preview: message.preview,
    body: message.preview || "No preview text was provided by the mailbox provider.",
    received: formatApiDateTime(message.receivedAt),
    unread: message.unread,
    classificationStatus: message.classificationStatus,
    parserNote: message.parserNote,
    otpAvailable: message.otpAvailable,
    otpDeliveryStatus: message.otpDeliveryStatus,
    otpCodeLast2: message.otpCodeLast2,
    otpExpiresAt: message.otpExpiresAt,
  };
}

function formatApiDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatExpiry(month: number | null, year: number | null) {
  if (!month || !year) return "—";
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function mapApiFundingRequest(request: ApiFundingRequest): FundingRequest {
  const mime = request.receipt?.detected_mime_type ?? "";
  const receiptType: FundingRequest["receiptType"] = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : "text";
  return {
    id: request.id,
    reference: request.reference,
    clientId: request.userId,
    cardLast4: request.card?.last4 ?? "????",
    accountId: request.card?.accountId ?? "",
    amount: Number(request.cardAmountUsdCents) / 100,
    providerFee: Number(request.providerFeeUsdCents) / 100,
    serviceFee: Number(request.ownFeeUsdCents) / 100,
    rialTotal: Number(request.clientPaysRial ?? "0"),
    receipt: request.receipt?.original_filename ?? "No receipt uploaded",
    receiptType,
    receiptScanStatus: request.receipt?.scan_status ?? null,
    adminNote: request.adminNote,
    serviceFeeBasisPoints: request.serviceFeeBasisPoints,
    rateRialPerUsd: request.rateRialPerUsd ? Number(request.rateRialPerUsd) : null,
    status: request.status,
    submitted: formatApiDate(request.submittedAt),
  };
}

async function fetchAllKycSubmissions(signal?: AbortSignal) {
  const items: ApiKycSubmission[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await fetchKycSubmissions({ limit: 100, cursor }, signal);
    items.push(...result.items);
    if (!result.nextCursor) return items;
    cursor = result.nextCursor;
  }
  return items;
}

function formatRial(value: number) {
  return `${new Intl.NumberFormat("en-US").format(Math.round(value))} IRR`;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function usePaginatedItems<T>(items: T[], pageSize = 5) {
  const [requestedPage, setRequestedPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return { page, pageItems, pageSize, setPage: setRequestedPage, totalItems: items.length, totalPages };
}

function ListPagination({ page, pageSize, totalItems, totalPages, onPageChange }: { page: number; pageSize: number; totalItems: number; totalPages: number; onPageChange: (page: number) => void }) {
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalItems);
  const pageNumbers = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : Array.from(new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages])).filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3 border-t border-[#eceaf2] px-5 py-4 text-sm text-[#8f8b9c] sm:flex-row sm:items-center sm:justify-between">
      <p>{start}–{end} of {totalItems}</p>
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} className={page === 1 ? "pointer-events-none opacity-45" : ""} onClick={(event) => { event.preventDefault(); onPageChange(Math.max(1, page - 1)); }} /></PaginationItem>
          {pageNumbers.map((item, index) => <Fragment key={item}>{index > 0 && item - pageNumbers[index - 1] > 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}<PaginationItem><PaginationLink href="#" isActive={item === page} onClick={(event) => { event.preventDefault(); onPageChange(item); }}>{item}</PaginationLink></PaginationItem></Fragment>)}
          <PaginationItem><PaginationNext href="#" aria-disabled={page === totalPages} className={page === totalPages ? "pointer-events-none opacity-45" : ""} onClick={(event) => { event.preventDefault(); onPageChange(Math.min(totalPages, page + 1)); }} /></PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function StatusBadge({ status }: { status: FundingStatus }) {
  const meta = fundingMeta[status];
  const classes = {
    amber: "border-[#f4d9aa] bg-[#fff5e4] text-[#a4600c]",
    blue: "border-[#d9d5ff] bg-[#f0eeff] text-[#5449c8]",
    violet: "border-[#ddd6fa] bg-[#f4f1ff] text-[#6e5cbe]",
    green: "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]",
    red: "border-[#f1c7cc] bg-[#fff0f2] text-[#b53847]",
  }[meta.color];
  return <Badge variant="outline" className={`${classes} rounded-full px-2.5 py-1 font-semibold`}>{meta.label}</Badge>;
}

function ReceiptIcon({ type }: { type: FundingRequest["receiptType"] }) {
  if (type === "video") return <Video className="size-4" />;
  if (type === "text") return <FileText className="size-4" />;
  if (type === "pdf") return <FileText className="size-4" />;
  return <Paperclip className="size-4" />;
}

export default function DashboardApp() {
  const [view, setView] = useState<View>("overview");
  const [backendDataLoaded, setBackendDataLoaded] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [cards, setCards] = useState<ClientCard[]>([]);
  const [accountEmails, setAccountEmails] = useState<AccountEmail[]>([]);
  const [fundingRequests, setFundingRequests] = useState<FundingRequest[]>([]);
  const [cardRequests, setCardRequests] = useState<ApiCardRequest[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionNotificationIssues, setTransactionNotificationIssues] = useState<TransactionNotificationIssue[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [msgHasMore, setMsgHasMore] = useState<Record<string, boolean>>({});
  const [msgBefore, setMsgBefore] = useState<Record<string, string | null>>({});
  const [supportConversations, setSupportConversations] = useState<SupportConversationSummary[]>([]);
  const [kycStatusByUser, setKycStatusByUser] = useState<Record<string, "approved" | "pending" | "rejected">>({});
  const [kycPendingCount, setKycPendingCount] = useState(0);
  const [paymentByUser, setPaymentByUser] = useState<Record<string, boolean>>({});
  const [paymentStatusByUser, setPaymentStatusByUser] = useState<Record<string, string | null>>({});
  const [paymentPipelineByUser, setPaymentPipelineByUser] = useState<Record<string, ClientPipelineItem>>({});
  const [paymentPipelineTick, setPaymentPipelineTick] = useState(0);
  const [supportAttachment, setSupportAttachment] = useState<File | null>(null);
  const [operationalSnapshot, setOperationalSnapshot] = useState<OperationalSnapshot | null>(null);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeAccountEmailId, setActiveAccountEmailId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [liveCardDetails, setLiveCardDetails] = useState<LiveCardDetails | null>(null);
  const [activeCardTransactions, setActiveCardTransactions] = useState<StoredCardTransaction[]>([]);
  const [cardStatePendingId, setCardStatePendingId] = useState<string | null>(null);
  const [fundingExecutionPendingId, setFundingExecutionPendingId] = useState<string | null>(null);
  const [cardRequestPendingId, setCardRequestPendingId] = useState<string | null>(null);
  const [fundingReauth, setFundingReauth] = useState<{ title: string; description: string } | null>(null);
  const fundingReauthRetryRef = useRef<(() => Promise<void>) | null>(null);
  const [fundingReauthPassword, setFundingReauthPassword] = useState("");
  const [fundingReauthCode, setFundingReauthCode] = useState("");
  const [fundingReauthBusy, setFundingReauthBusy] = useState(false);
  const [fundingWalletGate, setFundingWalletGate] = useState<{ request: FundingRequest; details: ProviderWalletGate } | null>(null);
  const [fundingWalletConfirmed, setFundingWalletConfirmed] = useState(false);
  const [emailActionPendingId, setEmailActionPendingId] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState("");
  const [search, setSearch] = useState("");
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [serviceFee, setServiceFee] = useState(2.5);
  const [exchangeRate, setExchangeRate] = useState(2_212_000);
  const [minimumFunding, setMinimumFunding] = useState(20);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [accountForm, setAccountForm] = useState({ name: "", owner: "", mailbox: "", mailProvider: "Outlook / Hotmail" as Account["mailProvider"], password: "", apiKey: "" });

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("accabad-theme");
    const timer = window.setTimeout(() => {
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("accabad-theme", theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardSnapshot(controller.signal)
      .then((snapshot) => {
        const nextCards: ClientCard[] = snapshot.cards.map((card) => ({
          id: card.id,
          providerCardId: card.providerCardId,
          accountId: card.accountId,
          bin: card.bin ?? "—",
          cardholder: card.cardholderName ?? "Unknown",
          email: card.cardEmail ?? "—",
          last4: card.last4 ?? "••••",
          label: card.label ?? "Card",
          balance: centsToUsd(card.balanceUsdCents) ?? 0,
          frozen: card.status === "frozen",
          expiry: formatExpiry(card.expiryMonth, card.expiryYear),
        }));

        const cardTotals = new Map<string, { count: number; cents: number }>();
        for (const card of snapshot.cards) {
          const current = cardTotals.get(card.accountId) ?? { count: 0, cents: 0 };
          current.count += 1;
          current.cents += Number(card.balanceUsdCents ?? "0");
          cardTotals.set(card.accountId, current);
        }

        const nextAccounts: Account[] = snapshot.accounts.map((account) => {
          const totals = cardTotals.get(account.id) ?? { count: 0, cents: 0 };
          const mailbox = account.emailAccount?.providerIdentityEmail ?? account.emailAccount?.emailAddress ?? "";
          const provider = account.emailAccount?.provider === "gmail" || account.loginEmail.toLowerCase().endsWith("@gmail.com") ? "Gmail" : "Outlook / Hotmail";
          return {
            id: account.id,
            name: account.label,
            owner: account.loginEmail,
            mailbox,
            password: "••••••••",
            keyHint: account.apiKeyHint ?? "Not connected",
            mailProvider: provider,
            accountBalance: centsToUsd(account.accountBalanceUsdCents),
            accountBalanceSource: account.accountBalanceSource,
            cardBalance: totals.cents / 100,
            cards: totals.count,
            status: account.status === "connected" ? "Connected" : "Attention",
            lastSync: account.lastSyncedAt ? formatApiDate(account.lastSyncedAt) : "Never",
            emailConnectionStatus: account.emailAccount?.connectionStatus ?? "not_connected",
            emailProviderIdentity: account.emailAccount?.providerIdentityEmail ?? null,
            emailLastSyncedAt: account.emailAccount?.lastSyncedAt ?? null,
            emailError: account.emailAccount?.lastErrorMessage ?? null,
          };
        });

        const nextClients: Client[] = snapshot.clients.map((client) => ({
          id: client.id,
          name: client.displayName ?? client.username ?? `Telegram ${client.telegramUserId}`,
          username: client.username ? (client.username.startsWith("@") ? client.username : `@${client.username}`) : "—",
          telegramId: client.telegramUserId,
          accountIds: client.accountIds,
          joined: formatApiDate(client.joinedAt),
          banned: Boolean(client.bannedAt),
          totalFunded: Number(client.totalFundedUsdCents) / 100,
        }));

        setAccounts(nextAccounts);
        setCards(nextCards);
        setClients(nextClients);
        setAccountEmails([]);
        setFundingRequests([]);
        setCardRequests([]);
        setTransactions([]);
        setMessages({});
        setActiveChatId(nextClients[0]?.id ?? "");
        setBackendDataLoaded(true);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof AdminApiError && error.status === 401) {
          window.location.replace("/login");
          return;
        }
        console.error("AccAbad backend snapshot unavailable.", error);
        toast.error("AccAbad backend is unavailable. No local fallback data or actions will be used.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!backendDataLoaded || !activeCardId) {
      setActiveCardTransactions([]);
      return;
    }
    let cancelled = false;
    fetchCardTransactions(activeCardId)
      .then((result) => { if (!cancelled) setActiveCardTransactions(result.items); })
      .catch(() => { if (!cancelled) setActiveCardTransactions([]); });
    return () => { cancelled = true; };
  }, [activeCardId, backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded || (view !== "overview" && view !== "requests")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([
        fetchFundingRequests({ search: view === "requests" ? search : undefined, limit: 100 }),
        fetchCardRequests({ search: view === "requests" ? search : undefined, limit: 100 }),
      ])
        .then(([fundingResult, cardResult]) => {
          if (cancelled) return;
          setFundingRequests(fundingResult.items.map(mapApiFundingRequest));
          setCardRequests(cardResult.items);
        })
        .catch((error) => {
          if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load requests.");
        });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [backendDataLoaded, view, search]);

  useEffect(() => {
    if (!backendDataLoaded || !activeAccountId) return;
    let cancelled = false;
    fetchAccountEmailMessages(activeAccountId)
      .then((result) => {
        if (cancelled) return;
        setAccountEmails((current) => [
          ...current.filter((email) => email.accountId !== activeAccountId),
          ...result.items.filter((message) => !message.providerRemoved).map((message) => mapStoredEmailMessage(activeAccountId, message)),
        ]);
      })
      .catch(() => {
        if (!cancelled) setAccountEmails((current) => current.filter((email) => email.accountId !== activeAccountId));
      });
    return () => { cancelled = true; };
  }, [activeAccountId, backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded) return;
    let cancelled = false;
    fetchFundingSettings().then((settings) => {
      if (cancelled) return;
      setServiceFee(settings.serviceFeeBasisPoints / 100);
      setMinimumFunding(settings.minimumUsdCents / 100);
      if (settings.rate) setExchangeRate(Number(settings.rate.rialPerUsd));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [backendDataLoaded]);


  useEffect(() => {
    if (!backendDataLoaded) return;
    let cancelled = false;
    Promise.all([fetchTelegramBotStatus(), fetchForceJoinChannels()])
      .then(([status, requiredChannels]) => {
        if (cancelled) return;
        setTelegramStatus(status);
        setChannels(requiredChannels.items.filter((item) => item.enabled).map((item) => item.chatId));
      })
      .catch(() => {
        if (!cancelled) { setTelegramStatus(null); setChannels([]); }
      });
    return () => { cancelled = true; };
  }, [backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded) return;
    let cancelled = false;
    const controller = new AbortController();
    fetchAllKycSubmissions(controller.signal)
      .then((items) => {
        if (cancelled) return;
        const rank = { approved: 3, pending: 2, rejected: 1 } as const;
        const map: Record<string, "approved" | "pending" | "rejected"> = {};
        for (const item of items) {
          const key = item.customer?.telegramUserId;
          if (!key) continue;
          const cur = map[key];
          if (!cur || rank[item.status] > rank[cur]) map[key] = item.status;
        }
        setKycStatusByUser(map);
        setKycPendingCount(items.filter((i) => i.status === "pending").length);
      })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded) return;
    let cancelled = false;
    fetchClientPipeline()
      .then((r) => { if (!cancelled) { const m: Record<string, boolean> = {}; const st: Record<string, string | null> = {}; const pipeline: Record<string, ClientPipelineItem> = {}; for (const it of r.items) { m[it.id] = it.declared; st[it.id] = it.status; pipeline[it.id] = it; } setPaymentByUser(m); setPaymentStatusByUser(st); setPaymentPipelineByUser(pipeline); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [backendDataLoaded, paymentPipelineTick]);

  useEffect(() => {
    if (!backendDataLoaded) return;
    let cancelled = false;
    fetchSupportConversations().then((result) => { if (!cancelled) setSupportConversations(result.items); }).catch(() => {});
    return () => { cancelled = true; };
  }, [backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded || view !== "operations") return;
    let cancelled = false;
    const load = () => fetchOperationalSnapshot().then((result) => { if (!cancelled) setOperationalSnapshot(result); }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load operational health.");
    });
    void load();
    const interval = window.setInterval(() => { void load(); }, 30000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [backendDataLoaded, view]);

  useEffect(() => {
    if (!backendDataLoaded || !activeChatId) return;
    let cancelled = false;
    fetchClientSupportMessages(activeChatId, { limit: 50 })
      .then((result) => {
        if (cancelled) return;
        const mapped: Message[] = result.items.map((item) => ({
          id: item.id,
          from: item.direction === "client_to_admin" ? "client" : "admin",
          body: item.text,
          time: new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          day: item.createdAt.slice(0, 10),
          status: item.status,
          lastDeliveryError: item.lastDeliveryError,
          attachment: item.attachment ? { filename: item.attachment.filename, downloadUrl: item.attachment.downloadUrl, mimeType: item.attachment.mimeType } : null,
        }));
        setMessages((current) => ({ ...current, [activeChatId]: mapped }));
        setMsgHasMore((current) => ({ ...current, [activeChatId]: result.hasMore }));
        setMsgBefore((current) => ({ ...current, [activeChatId]: result.nextBefore }));
        void fetchSupportConversations().then((summary) => setSupportConversations(summary.items)).catch(() => {});
      })
      .catch(() => { if (!cancelled) setMessages((current) => ({ ...current, [activeChatId]: [] })); });
    return () => { cancelled = true; };
  }, [activeChatId, backendDataLoaded]);

  const loadOlderMessages = async (clientId: string) => {
    const before = msgBefore[clientId];
    if (!before) return;
    try {
      const res = await fetchClientSupportMessages(clientId, { limit: 50, before });
      const mapped: Message[] = res.items.map((item) => ({
        id: item.id,
        from: item.direction === "client_to_admin" ? "client" : "admin",
        body: item.text,
        time: new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        status: item.status,
        lastDeliveryError: item.lastDeliveryError,
        attachment: item.attachment ? { filename: item.attachment.filename, downloadUrl: item.attachment.downloadUrl, mimeType: item.attachment.mimeType } : null,
      }));
      setMessages((current) => ({ ...current, [clientId]: [...mapped, ...(current[clientId] ?? [])] }));
      setMsgHasMore((current) => ({ ...current, [clientId]: res.hasMore }));
      setMsgBefore((current) => ({ ...current, [clientId]: res.nextBefore }));
    } catch {}
  };

  useEffect(() => {
    if (!backendDataLoaded) return;
    const url = new URL(window.location.href);
    const oauth = url.searchParams.get("oauth");
    if (!oauth) return;
    const accountId = url.searchParams.get("account");
    if (oauth === "outlook-connected") {
      toast.success("Outlook / Hotmail connected. You can now synchronize the inbox.");
      if (accountId) { setView("accounts"); setActiveAccountId(accountId); }
    } else if (oauth === "outlook-error") {
      toast.error(`Outlook connection failed (${url.searchParams.get("code") ?? "unknown_error"}).`);
    } else if (oauth === "gmail-connected") {
      toast.success("Gmail connected. You can now synchronize the inbox.");
      if (accountId) { setView("accounts"); setActiveAccountId(accountId); }
    } else if (oauth === "gmail-error") {
      toast.error(`Gmail connection failed (${url.searchParams.get("code") ?? "unknown_error"}).`);
    }
    url.searchParams.delete("oauth");
    url.searchParams.delete("account");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [backendDataLoaded]);

  useEffect(() => {
    if (!backendDataLoaded || (view !== "requests" && view !== "clients")) return;
    const timer = window.setTimeout(() => {
      const transactionSearch = view === "requests" ? search.trim() || undefined : undefined;
      const applyTransactions = (stored: Awaited<ReturnType<typeof fetchTransactions>>) => {
        setTransactions(stored.items.map((tx) => ({
          id: tx.id,
          clientId: tx.clientId,
          accountId: tx.accountId,
          cardLast4: tx.last4 ?? "????",
          merchant: tx.merchant ?? "Provider transaction",
          amount: Number(tx.amountMinor) / 100,
          type: tx.transactionType ?? "Transaction",
          status: tx.transactionStatus.charAt(0).toUpperCase() + tx.transactionStatus.slice(1),
          date: new Date(tx.occurredAt).toLocaleString(),
          notificationStatus: tx.notificationStatus,
          notificationError: tx.notificationError,
        })));
      };
      if (view === "requests") {
        Promise.all([
          fetchTransactions({ search: transactionSearch, limit: 100 }),
          fetchTransactionNotificationIssues({ search: transactionSearch, limit: 50 }),
        ]).then(([stored, issues]) => {
          applyTransactions(stored);
          setTransactionNotificationIssues(issues.items);
        }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load transactions."));
      } else {
        fetchTransactions({ limit: 100 })
          .then(applyTransactions)
          .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load transactions."));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [backendDataLoaded, search, view]);

  const reconcileNotificationIssue = async (id: string, action: "acknowledge" | "retry") => {
    try {
      await reconcileTransactionNotification(id, action);
      const issues = await fetchTransactionNotificationIssues({ search: search.trim() || undefined, limit: 50 });
      setTransactionNotificationIssues(issues.items);
      toast.success(action === "retry" ? "Notification queued for a safe retry." : "Notification mismatch acknowledged.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reconcile notification issue.");
    }
  };

  const activeClient = clients.find((client) => client.id === activeClientId) ?? null;
  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? null;
  const activeAccountEmail = accountEmails.find((email) => email.id === activeAccountEmailId) ?? null;
  const activeCard = cards.find((card) => card.id === activeCardId) ?? null;
  const activeAccountCards = activeAccount ? cards.filter((card) => card.accountId === activeAccount.id) : [];
  const activeAccountEmails = activeAccount ? accountEmails.filter((email) => email.accountId === activeAccount.id) : [];
  const activeAccountClient = activeAccount ? clients.find((client) => client.accountIds.includes(activeAccount.id)) ?? null : null;
  const activeRequest = fundingRequests.find((request) => request.id === activeRequestId) ?? null;
  const activeChatClient = clients.find((client) => client.id === activeChatId) ?? clients[0];
  const cardsForClient = (client: Client) => cards.filter((card) => client.accountIds.includes(card.accountId));
  const activeClientCards = activeClient ? cardsForClient(activeClient) : [];

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? accounts.filter((account) => {
      const accountCards = cards.filter((card) => card.accountId === account.id).map((card) => `${card.label} ${card.id} ${card.last4} ${card.bin}`).join(" ");
      const inbox = accountEmails.filter((email) => email.accountId === account.id).map((email) => `${email.subject} ${email.sender} ${email.category}`).join(" ");
      return `${account.name} ${account.owner} ${account.mailbox} ${accountCards} ${inbox}`.toLowerCase().includes(needle);
    }) : accounts;
  }, [accountEmails, accounts, cards, search]);

  const filteredClients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? clients.filter((client) => {
      const connectedAccounts = accounts.filter((account) => client.accountIds.includes(account.id)).map((account) => account.name).join(" ");
      const clientCards = cards.filter((card) => client.accountIds.includes(card.accountId)).map((card) => `${card.label} ${card.last4} ${card.id}`).join(" ");
      return `${client.name} ${client.username} ${client.telegramId} ${connectedAccounts} ${clientCards}`.toLowerCase().includes(needle);
    }) : clients;
  }, [accounts, cards, clients, search]);

  const accountListNeedle = search.trim().toLowerCase();
  const activeAccountMatchesSearch = Boolean(activeAccount && `${activeAccount.name} ${activeAccount.owner} ${activeAccount.mailbox}`.toLowerCase().includes(accountListNeedle));
  const activeAccountCardMatches = activeAccountCards.filter((card) => !accountListNeedle || activeAccountMatchesSearch || `${card.label} ${card.id} ${card.last4} ${card.bin} ${card.cardholder} ${card.email}`.toLowerCase().includes(accountListNeedle));
  const activeAccountEmailMatches = activeAccountEmails.filter((email) => !accountListNeedle || activeAccountMatchesSearch || `${email.subject} ${email.sender} ${email.preview} ${email.category} ${email.cardLast4 ?? ""}`.toLowerCase().includes(accountListNeedle));
  const accountCardPaging = usePaginatedItems(activeAccountCardMatches, 4);
  const accountEmailPaging = usePaginatedItems(activeAccountEmailMatches, 4);
  const clientCardPaging = usePaginatedItems(activeClientCards, 4);
  const activeClientTransactions = activeClient ? transactions.filter((transaction) => transaction.clientId === activeClient.id && activeClientCards.some((card) => card.last4 === transaction.cardLast4)) : [];
  const clientTransactionPaging = usePaginatedItems(activeClientTransactions, 4);

  const openAddAccount = () => {
    setEditingAccountId(null);
    setAccountForm({ name: "", owner: "", mailbox: "", mailProvider: "Outlook / Hotmail", password: "", apiKey: "" });
    setAccountDialogOpen(true);
  };

  const openEditAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setAccountForm({ name: account.name, owner: account.owner, mailbox: account.mailbox, mailProvider: account.mailProvider, password: "", apiKey: "" });
    setAccountDialogOpen(true);
  };

  const saveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.owner.trim()) {
      toast.error("Account name and email are required.");
      return;
    }
    if (!editingAccountId && (!accountForm.password.trim() || !accountForm.apiKey.trim())) {
      toast.error("Password and API key are required for a new account.");
      return;
    }
    try {
      if (editingAccountId) {
        const update: { label?: string; loginEmail?: string; password?: string; apiKey?: string; emailProvider?: "outlook" | "gmail"; emailAddress?: string | null } = {
          label: accountForm.name.trim(),
          loginEmail: accountForm.owner.trim(),
          emailProvider: accountForm.mailProvider === "Gmail" ? "gmail" : "outlook",
          emailAddress: accountForm.mailbox.trim() ? accountForm.mailbox.trim() : null,
        };
        if (accountForm.password.trim()) update.password = accountForm.password;
        if (accountForm.apiKey.trim()) update.apiKey = accountForm.apiKey;
        await updateAccount(editingAccountId, update);
        setAccounts((current) => current.map((account) => {
          if (account.id !== editingAccountId) return account;
          const nextMailbox = accountForm.mailbox.trim();
          const emailConnectionChanged = account.mailProvider !== accountForm.mailProvider || account.mailbox.toLowerCase() !== nextMailbox.toLowerCase();
          return {
            ...account,
            name: accountForm.name.trim(),
            owner: accountForm.owner.trim(),
            mailbox: nextMailbox,
            mailProvider: accountForm.mailProvider,
            password: "••••••••",
            keyHint: accountForm.apiKey ? `••••••••${accountForm.apiKey.slice(-4)}` : account.keyHint,
            status: accountForm.apiKey ? "Attention" : account.status,
            emailConnectionStatus: emailConnectionChanged ? "not_connected" : account.emailConnectionStatus,
            emailProviderIdentity: emailConnectionChanged ? null : account.emailProviderIdentity,
            emailLastSyncedAt: emailConnectionChanged ? null : account.emailLastSyncedAt,
            emailError: emailConnectionChanged ? null : account.emailError,
          };
        }));
        toast.success("Account connection updated securely.");
      } else {
        const mailbox = accountForm.mailbox.trim().toLowerCase();
        const provider = accountForm.mailProvider === "Gmail" ? "gmail" : "outlook";
        const domain = mailbox ? mailbox.split("@").pop() ?? "" : "";
        const domainOk = !mailbox || (provider === "gmail" ? domain === "gmail.com" : domain === "outlook.com" || domain === "hotmail.com");
        if (!accountForm.name.trim() || !accountForm.owner.trim() || !accountForm.password || !accountForm.apiKey) {
          toast.error("Fill in all fields: name, login email, password, and API key.");
          return;
        }
        if (!domainOk) {
          toast.error(provider === "gmail" ? "The connected inbox must be a @gmail.com address when provided." : "The connected inbox must be an @outlook.com or @hotmail.com address when provided.");
          return;
        }
        const created = await createAccount({
          label: accountForm.name.trim(),
          loginEmail: accountForm.owner.trim(),
          password: accountForm.password,
          apiKey: accountForm.apiKey,
          emailProvider: provider,
          ...(mailbox ? { emailAddress: mailbox } : {}),
        });
        setAccounts((current) => [...current, {
          id: created.id,
          name: accountForm.name.trim(),
          owner: accountForm.owner.trim(),
          mailbox,
          mailProvider: accountForm.mailProvider,
          password: "••••••••",
          keyHint: `••••••••${accountForm.apiKey.slice(-4)}`,
          accountBalance: null,
          accountBalanceSource: "unavailable",
          cardBalance: 0,
          cards: 0,
          status: "Attention",
          lastSync: "Never",
          emailConnectionStatus: "not_connected",
          emailProviderIdentity: null,
          emailLastSyncedAt: null,
          emailError: null,
        }]);
        toast.success("Account stored with encrypted credentials.");
      }
      setAccountDialogOpen(false);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) window.location.replace("/login");
      toast.error(error instanceof Error ? error.message : "Account save failed.");
    }
  };

  const revealCredentials = async (account: Account) => {
    const password = window.prompt("Re-enter your AccAbad admin password to reveal credentials:");
    if (!password) return;
    const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
    try {
      await reauthenticateAdmin(password, code || undefined);
      const secrets = await revealAccountSecrets(account.id);
      const originalHint = account.keyHint;
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, password: secrets.password, keyHint: secrets.apiKey } : item));
      toast.success("Credentials revealed for 30 seconds. This action was audited.");
      window.setTimeout(() => {
        setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, password: "••••••••", keyHint: originalHint } : item));
      }, 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Credential reveal failed.");
    }
  };

  const syncProviderAccount = async (account: Account) => {
    if (!backendDataLoaded) { toast.info("Provider sync is available when PostgreSQL-backed accounts are loaded."); return; }
    try {
      const verified = await verifyAccountConnection(account.id);
      const synced = await syncAccountCards(account.id);
      toast.success(`Kripicard verified (${verified.cardCount} card${verified.cardCount === 1 ? "" : "s"}) and synchronized ${synced.syncedCards}.`);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kripicard synchronization failed.");
    }
  };

  const connectOutlook = async (account: Account) => {
    if (!backendDataLoaded) { toast.info("Outlook OAuth is available for PostgreSQL-backed accounts."); return; }
    if (account.mailProvider !== "Outlook / Hotmail") { toast.info("This account is configured for Gmail. Use the Gmail connection controls instead."); return; }
    setEmailActionPendingId(account.id);
    try {
      const result = await connectOutlookMailbox(account.id);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setEmailActionPendingId(null);
      toast.error(error instanceof Error ? error.message : "Outlook connection could not be started.");
    }
  };

  const syncOutlook = async (account: Account) => {
    if (!backendDataLoaded) return;
    setEmailActionPendingId(account.id);
    try {
      const result = await syncOutlookMailbox(account.id);
      const messages = await fetchAccountEmailMessages(account.id);
      setAccountEmails((current) => [
        ...current.filter((email) => email.accountId !== account.id),
        ...messages.items.filter((message) => !message.providerRemoved).map((message) => mapStoredEmailMessage(account.id, message)),
      ]);
      setAccounts((current) => current.map((item) => item.id === account.id ? {
        ...item,
        emailConnectionStatus: "connected",
        emailLastSyncedAt: new Date().toISOString(),
        emailError: null,
      } : item));
      toast.success(`Outlook inbox synchronized: ${result.received} message change${result.received === 1 ? "" : "s"}.`);
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "microsoft_reauth_required") {
        setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, emailConnectionStatus: "reauth_required", emailError: error.message } : item));
      }
      toast.error(error instanceof Error ? error.message : "Outlook synchronization failed.");
    } finally {
      setEmailActionPendingId(null);
    }
  };

  const disconnectOutlook = async (account: Account) => {
    const password = window.prompt("Re-enter your AccAbad admin password to disconnect this Outlook mailbox:");
    if (!password) return;
    const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
    setEmailActionPendingId(account.id);
    try {
      await reauthenticateAdmin(password, code || undefined);
      await disconnectOutlookMailbox(account.id);
      setAccounts((current) => current.map((item) => item.id === account.id ? {
        ...item,
        emailConnectionStatus: "not_connected",
        emailProviderIdentity: null,
        emailLastSyncedAt: null,
        emailError: null,
      } : item));
      toast.success("Outlook mailbox disconnected. Stored message metadata was retained for audit/history.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Outlook disconnect failed.");
    } finally {
      setEmailActionPendingId(null);
    }
  };

  const connectGmail = async (account: Account) => {
    if (!backendDataLoaded) { toast.info("Gmail OAuth is available for PostgreSQL-backed accounts."); return; }
    if (account.mailProvider !== "Gmail") { toast.info("This account is configured for Outlook / Hotmail. Use the Outlook connection controls instead."); return; }
    setEmailActionPendingId(account.id);
    try {
      const result = await connectGmailMailbox(account.id);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setEmailActionPendingId(null);
      toast.error(error instanceof Error ? error.message : "Gmail connection could not be started.");
    }
  };

  const syncGmail = async (account: Account) => {
    if (!backendDataLoaded) return;
    setEmailActionPendingId(account.id);
    try {
      const result = await syncGmailMailbox(account.id);
      const messages = await fetchAccountEmailMessages(account.id);
      setAccountEmails((current) => [
        ...current.filter((email) => email.accountId !== account.id),
        ...messages.items.filter((message) => !message.providerRemoved).map((message) => mapStoredEmailMessage(account.id, message)),
      ]);
      setAccounts((current) => current.map((item) => item.id === account.id ? {
        ...item,
        emailConnectionStatus: "connected",
        emailLastSyncedAt: new Date().toISOString(),
        emailError: null,
      } : item));
      toast.success(`Gmail inbox synchronized: ${result.received} message change${result.received === 1 ? "" : "s"}${result.fullSync ? " (full sync)" : ""}.`);
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "google_reauth_required") {
        setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, emailConnectionStatus: "reauth_required", emailError: error.message } : item));
      }
      toast.error(error instanceof Error ? error.message : "Gmail synchronization failed.");
    } finally {
      setEmailActionPendingId(null);
    }
  };

  const disconnectGmail = async (account: Account) => {
    const password = window.prompt("Re-enter your AccAbad admin password to disconnect this Gmail mailbox:");
    if (!password) return;
    const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
    setEmailActionPendingId(account.id);
    try {
      await reauthenticateAdmin(password, code || undefined);
      await disconnectGmailMailbox(account.id);
      setAccounts((current) => current.map((item) => item.id === account.id ? {
        ...item,
        emailConnectionStatus: "not_connected",
        emailProviderIdentity: null,
        emailLastSyncedAt: null,
        emailError: null,
      } : item));
      toast.success("Gmail mailbox disconnected. Stored message metadata was retained for audit/history.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail disconnect failed.");
    } finally {
      setEmailActionPendingId(null);
    }
  };

  const revealProviderCardDetails = async (card: ClientCard) => {
    if (!backendDataLoaded) { toast.info("Live card details are available only for PostgreSQL-backed provider cards."); return; }
    const password = window.prompt("Re-enter your AccAbad admin password to reveal the live card number and CVV:");
    if (!password) return;
    const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
    try {
      await reauthenticateAdmin(password, code || undefined);
      const details = await revealLiveCardDetails(card.id);
      setLiveCardDetails(details);
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, balance: Number(details.balanceUsdCents) / 100, frozen: details.status === "frozen", expiry: details.expiry } : item));
      toast.success("Live sensitive card details retrieved. They are not persisted by AccAbad.");
      window.setTimeout(() => setLiveCardDetails(null), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Card detail reveal failed.");
    }
  };

  const syncProviderCardTransactions = async (card: ClientCard) => {
    if (!backendDataLoaded) { toast.info("Provider transaction sync is available for PostgreSQL-backed cards."); return; }
    try {
      const result = await syncCardTransactions(card.id);
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, balance: Number(result.balanceUsdCents) / 100 } : item));
      const stored = await fetchCardTransactions(card.id);
      if (activeCardId === card.id) setActiveCardTransactions(stored.items);
      toast.success(`Transaction sync complete: ${result.received} received, ${result.inserted} new.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transaction synchronization failed.");
    }
  };

  const openCreateCard = (accountId?: string) => {
    const assigned = accountId ? clients.find((client) => client.accountIds.includes(accountId)) : null;
    if (assigned) {
      window.location.href = `/clients/${encodeURIComponent(assigned.id)}?createCard=1&accountId=${encodeURIComponent(accountId!)}`;
      return;
    }
    setView("clients");
    toast.info("Open the customer's full page to assign this provider account and create a card directly.");
  };

  const openFundCard = (...args: [cardId?: string, accountId?: string]) => {
    void args;
    setView("requests");
    toast.info("Card funding is executed only from accepted funding requests in Request Center.");
  };

  const removeAccount = async () => {
    if (!deleteAccountId) return;
    const id = deleteAccountId;
    const connectedUsers = clients.filter((client) => client.accountIds.includes(id)).length;
    if (connectedUsers) {
      toast.error(`Reassign ${connectedUsers} connected client${connectedUsers > 1 ? "s" : ""} before archiving this account.`);
      setDeleteAccountId(null);
      return;
    }
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. The account was not changed.");
      return;
    }
    try {
      await archiveAccount(id);
      setAccounts((current) => current.filter((account) => account.id !== id));
      setCards((current) => current.filter((card) => card.accountId !== id));
      setAccountEmails((current) => current.filter((email) => email.accountId !== id));
      setDeleteAccountId(null);
      toast.success("Account archived and mailbox authorization disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account archive failed.");
    }
  };

  const openAccountEmail = (emailId: string) => {
    setActiveAccountEmailId(emailId);
    setAccountEmails((current) => current.map((email) => email.id === emailId ? { ...email, unread: false } : email));
  };

  const reclassifyActiveAccountEmail = async () => {
    if (!activeAccount) return;
    setEmailActionPendingId(activeAccount.id);
    try {
      const result = await classifyAccountEmail(activeAccount.id);
      const messages = await fetchAccountEmailMessages(activeAccount.id);
      setAccountEmails((current) => [
        ...current.filter((email) => email.accountId !== activeAccount.id),
        ...messages.items.filter((message) => !message.providerRemoved).map((message) => mapStoredEmailMessage(activeAccount.id, message)),
      ]);
      toast.success(`Email classification complete: ${result.classified} classified, ${result.quarantined} quarantined, ${result.otpCreated} OTP created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email classification failed.");
    } finally {
      setEmailActionPendingId(null);
    }
  };

  const revealActiveEmailOtp = async () => {
    if (!activeAccountEmail?.otpAvailable) return;
    const password = window.prompt("Re-enter your AccAbad admin password to reveal this OTP:");
    if (!password) return;
    const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
    try {
      await reauthenticateAdmin(password, code || undefined);
      const otp = await revealParsedOtp(activeAccountEmail.id);
      window.alert(`OTP: ${otp.code}\nExpires: ${formatApiDateTime(otp.expiresAt)}\nDelivery: ${otp.deliveryStatus}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OTP reveal failed.");
    }
  };

  const toggleBan = async (clientId: string) => {
    const target = clients.find((client) => client.id === clientId);
    if (!target) return;
    const nextBanned = !target.banned;
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. Client access was not changed.");
      return;
    }
    try {
      await setClientBanned(clientId, nextBanned);
      setClients((current) => current.map((client) => client.id === clientId ? { ...client, banned: nextBanned } : client));
      toast.success(nextBanned ? "Client banned from the bot." : "Client unbanned.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Client moderation update failed.");
    }
  };

  const toggleCard = async (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. Card state was not changed.");
      return;
    }
    if (cardStatePendingId) return;
    const action = card.frozen ? "unfreeze" : "freeze";
    setCardStatePendingId(cardId);
    try {
      const result = await setCardFrozenState(cardId, action);
      if (result.needsReconciliation) {
        toast.warning(`Kripicard ${action} outcome is uncertain. Operation ${result.operationId ?? "unknown"} needs reconciliation before another state change.`);
        return;
      }
      setCards((current) => current.map((item) => item.id === cardId ? {
        ...item,
        frozen: result.status === "frozen",
        balance: result.balanceUsdCents == null ? item.balance : Number(result.balanceUsdCents) / 100,
      } : item));
      toast.success(result.noOp ? `Card is already ${result.status}.` : `Card ${action === "freeze" ? "frozen" : "unfrozen"} by Kripicard${result.reconciled ? " after reconciliation" : ""}.`);
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "feature_disabled") {
        toast.error("Freeze/unfreeze is installed but disabled. Enable the live-provider and card-state write gates in deployment configuration.");
      } else if (error instanceof AdminApiError && error.code === "runtime_kill_switch") {
        toast.error("Kripicard writes are disabled by an emergency runtime control. Open Operations and enable Provider writes before changing card state.");
      } else if (error instanceof AdminApiError && error.code === "read_only_mode") {
        toast.error("AccAbad is in emergency read-only mode. Disable Read-only mode from Operations before changing card state.");
      } else {
        toast.error(error instanceof Error ? error.message : "Card state update failed.");
      }
    } finally {
      setCardStatePendingId(null);
    }
  };

  const refreshProviderCardStatus = async (card: ClientCard) => {
    if (!backendDataLoaded) { toast.info("Live status refresh is available for PostgreSQL-backed cards."); return; }
    if (cardStatePendingId) return;
    setCardStatePendingId(card.id);
    try {
      const result = await refreshCardStatus(card.id);
      setCards((current) => current.map((item) => item.id === card.id ? {
        ...item,
        frozen: result.status === "frozen",
        balance: result.balanceUsdCents == null ? item.balance : Number(result.balanceUsdCents) / 100,
      } : item));
      toast.success(`Kripicard status refreshed: ${result.status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Card status refresh failed.");
    } finally {
      setCardStatePendingId(null);
    }
  };

  const reloadFundingRequests = async () => {
    const result = await fetchFundingRequests({ search, limit: 100 });
    setFundingRequests(result.items.map(mapApiFundingRequest));
  };

  const reloadCardRequests = async () => {
    const result = await fetchCardRequests({ search, limit: 100 });
    setCardRequests(result.items);
  };

  const queueFundingReauthentication = (title: string, description: string, retry: () => Promise<void>) => {
    fundingReauthRetryRef.current = retry;
    setFundingReauth({ title, description });
    setFundingReauthPassword("");
    setFundingReauthCode("");
  };

  const submitFundingReauthentication = async () => {
    if (!fundingReauthPassword.trim() || !fundingReauthRetryRef.current) return;
    const retry = fundingReauthRetryRef.current;
    setFundingReauthBusy(true);
    try {
      await reauthenticateAdmin(fundingReauthPassword, fundingReauthCode.trim() || undefined);
      setFundingReauth(null);
      fundingReauthRetryRef.current = null;
      setFundingReauthPassword("");
      setFundingReauthCode("");
      toast.success("Reauthenticated. Continuing the funding action.");
      await retry();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
    } finally {
      setFundingReauthBusy(false);
    }
  };

  const providerGateMessage = (error: AdminApiError) => {
    if (error.code !== "provider_money_not_ready") return null;
    const details = error.details as { blockers?: unknown } | undefined;
    const blockers = Array.isArray(details?.blockers) ? details.blockers.filter((value): value is string => typeof value === "string") : [];
    return blockers.length
      ? `Provider readiness is blocking this action: ${blockers.join(", ")}. Clear those checks in Operations → Kripicard.`
      : error.message;
  };

  const reviewAdditionalCardPayment = async (request: ApiCardRequest, action: "accept" | "correction" | "reject") => {
    if (!backendDataLoaded || cardRequestPendingId || !request.payment) return;
    const note = action === "accept"
      ? ""
      : (window.prompt(action === "correction" ? "Tell the customer what must be corrected:" : "Optional payment rejection note:") ?? "");
    if (action === "correction" && !note.trim()) return;
    setCardRequestPendingId(request.id);
    try {
      await reviewCustomerPayment(request.payment.id, { action, note: note.trim() || null });
      await reloadCardRequests();
      toast.success(
        action === "accept"
          ? "Payment receipt accepted. You can now approve the card request."
          : action === "correction"
            ? "Replacement receipt requested."
            : "Payment rejected.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment review failed.");
    } finally {
      setCardRequestPendingId(null);
    }
  };

  const reviewAdditionalCardRequest = async (request: ApiCardRequest, action: "approve" | "reject", accountId?: string, bin?: string) => {
    if (!backendDataLoaded || cardRequestPendingId) return;
    if (action === "approve" && (!accountId || !bin)) {
      toast.error("Choose the internal Kripicard account and BIN before approving.");
      return;
    }
    const note = action === "reject" ? (window.prompt("Optional rejection note for the customer:") ?? "") : "";
    setCardRequestPendingId(request.id);
    try {
      await reviewCardRequest(request.id, {
        action,
        selectedAccountId: accountId ?? null,
        selectedBin: bin ?? null,
        note: note.trim() || null,
      });
      await reloadCardRequests();
      toast.success(action === "approve" ? "Card request approved. The selected account is now assigned internally and ready for issuance." : "Card request rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Card request review failed.");
    } finally {
      setCardRequestPendingId(null);
    }
  };

  const issueAdditionalCardRequest = async (request: ApiCardRequest, options: { confirmed?: boolean; allowReauthPrompt?: boolean } = {}) => {
    if (!backendDataLoaded || cardRequestPendingId) return;
    const confirmed = options.confirmed === true || window.confirm("Confirm that the selected Kripicard wallet has enough crypto funding for this card creation.");
    if (!confirmed) return;
    setCardRequestPendingId(request.id);
    try {
      const result = await issueCardRequest(request.id, true);
      await reloadCardRequests();
      if (result.status === "issued") toast.success("Card created and linked to the customer.");
      else toast.warning("Card creation outcome is uncertain. Use Reconcile; do not create another card.");
    } catch (error) {
      try { await reloadCardRequests(); } catch {}
      if (options.allowReauthPrompt !== false && error instanceof AdminApiError && error.code === "reauthentication_required") {
        queueFundingReauthentication(
          "Confirm live card creation",
          "Creating this card changes provider money state. Re-enter your admin credentials, then AccAbad will retry this exact issuance action.",
          () => issueAdditionalCardRequest(request, { confirmed: true, allowReauthPrompt: false }),
        );
      } else if (error instanceof AdminApiError && error.code === "mfa_required") {
        toast.error("Enable MFA in Settings → Security before performing live card creation.");
      } else if (error instanceof AdminApiError && error.code === "feature_disabled") {
        toast.error("Card creation is installed but disabled. Enable the live-provider and card-creation deployment gates.");
      } else if (error instanceof AdminApiError && error.code === "runtime_kill_switch") {
        toast.error("Card creation is disabled by an emergency runtime control.");
      } else if (error instanceof AdminApiError && providerGateMessage(error)) {
        toast.error(providerGateMessage(error)!);
      } else {
        toast.error(error instanceof Error ? error.message : "Card creation failed.");
      }
    } finally {
      setCardRequestPendingId(null);
    }
  };

  const reconcileAdditionalCardRequest = async (request: ApiCardRequest, allowReauthPrompt = true) => {
    if (!backendDataLoaded || cardRequestPendingId) return;
    setCardRequestPendingId(request.id);
    try {
      const result = await reconcileCardRequest(request.id);
      await reloadCardRequests();
      if (result.status === "issued") toast.success("Card issuance reconciled and completed.");
      else toast.warning("No unique matching card was found yet. Keep this request in reconciliation.");
    } catch (error) {
      if (allowReauthPrompt && error instanceof AdminApiError && error.code === "reauthentication_required") {
        queueFundingReauthentication(
          "Reconcile card creation",
          "Reconciliation reads the provider state for a money-sensitive card creation. Re-enter your admin credentials to continue.",
          () => reconcileAdditionalCardRequest(request, false),
        );
      } else {
        toast.error(error instanceof Error ? error.message : "Card issuance reconciliation failed.");
      }
    } finally {
      setCardRequestPendingId(null);
    }
  };

  const attachAdditionalCardRequest = async (request: ApiCardRequest, cardId: string) => {
    if (!backendDataLoaded || cardRequestPendingId) return;
    setCardRequestPendingId(request.id);
    try {
      const result = await attachExistingCardRequest(request.id, cardId);
      await reloadCardRequests();
      toast.success(`Existing card •${result.last4 ?? "????"} attached. The request is now issued.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach the existing card.");
    } finally {
      setCardRequestPendingId(null);
    }
  };

  const advanceRequest = async (request: FundingRequest) => {
    if (request.status !== "pending_review") return;
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. Funding request was not changed.");
      return;
    }
    try {
      await reviewFundingRequest(request.id, { action: "accept" });
      await reloadFundingRequests();
      toast.success("Payment evidence accepted. Use Fund card after recent reauthentication when provider funding is enabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Funding request review failed.");
    }
  };

  const requestFundingCorrection = async () => {
    if (!activeRequest || !backendDataLoaded) return;
    const note = window.prompt("Explain what receipt or payment evidence must be corrected:");
    if (!note?.trim()) return;
    try {
      await reviewFundingRequest(activeRequest.id, { action: "correction", note: note.trim() });
      await reloadFundingRequests();
      toast.success("Correction requested. The client can upload replacement evidence in Telegram.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not request correction."); }
  };

  const rejectRequest = async () => {
    if (!activeRequest) return;
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. Funding request was not changed.");
      return;
    }
    try {
      await reviewFundingRequest(activeRequest.id, { action: "reject", note: rejectNote.trim() || null });
      await reloadFundingRequests();
      setRejectDialogOpen(false);
      setRejectNote("");
      toast.success("Request rejected and queued for Telegram notification.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Funding request rejection failed."); }
  };


  const executeAcceptedFunding = async (
    request: FundingRequest,
    mode: "fund" | "reconcile",
    options: { allowReauthPrompt?: boolean; walletFundingConfirmed?: boolean } = { allowReauthPrompt: true },
  ) => {
    if (!backendDataLoaded || fundingExecutionPendingId) return;
    setFundingExecutionPendingId(request.id);
    try {
      const result = mode === "fund" ? await executeFundingRequest(request.id, options.walletFundingConfirmed === true) : await reconcileFundingRequest(request.id);
      await reloadFundingRequests();
      if (result.status === "completed") {
        toast.success(result.reconciled ? "Funding was reconciled and marked completed." : "Kripicard funded the card and the request is complete.");
      } else {
        const delta = result.evidence?.balanceDeltaUsdCents;
        toast.warning(`Funding remains unresolved. AccAbad will not retry fundcard automatically${delta != null ? `; observed balance delta: ${(Number(delta) / 100).toFixed(2)}` : ""}. Confirm the outcome with Kripicard before resolving.`);
      }
    } catch (error) {
      try { await reloadFundingRequests(); } catch {}
      if (
        mode === "fund" &&
        options.allowReauthPrompt !== false &&
        error instanceof AdminApiError &&
        error.code === "reauthentication_required"
      ) {
        queueFundingReauthentication(
          "Confirm live card funding",
          `Funding card •${request.cardLast4} changes provider money state. Re-enter your admin credentials, then AccAbad will retry this exact funding action automatically.`,
          () => executeAcceptedFunding(request, mode, { allowReauthPrompt: false, walletFundingConfirmed: options.walletFundingConfirmed }),
        );
      } else if (error instanceof AdminApiError && error.code === "mfa_required") {
        toast.error("Enable MFA in Settings → Security before performing live provider money writes.");
      } else if (error instanceof AdminApiError && error.code === "feature_disabled") {
        toast.error("Card funding is installed but disabled. Enable the live-provider and card-funding deployment gates, including LIVE_PROVIDER_WRITE_CONFIRMATION, then recreate the app and worker containers.");
      } else if (error instanceof AdminApiError && error.code === "runtime_kill_switch") {
        toast.error("Card funding is disabled by an emergency runtime control. Open Operations and enable both Provider writes and Card funding.");
      } else if (error instanceof AdminApiError && error.code === "read_only_mode") {
        toast.error("AccAbad is in emergency read-only mode. Disable Read-only mode from Operations before funding a card.");
      } else if (error instanceof AdminApiError && providerGateMessage(error)) {
        toast.error(providerGateMessage(error)!);
      } else {
        toast.error(error instanceof Error ? error.message : "Card funding action failed.");
      }
    } finally {
      setFundingExecutionPendingId(null);
    }
  };

  const openFundingWalletGate = async (request: FundingRequest) => {
    if (!request.accountId) { toast.error("This request has no Kripicard account assignment."); return; }
    setFundingExecutionPendingId(request.id);
    try {
      const details = await fetchProviderWalletGate(request.accountId);
      setFundingWalletConfirmed(false);
      setFundingWalletGate({ request, details });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the Kripicard wallet step.");
    } finally {
      setFundingExecutionPendingId(null);
    }
  };

  const resolveFundingOutcome = async (
    request: FundingRequest,
    outcome: "completed" | "not_funded",
    options?: { providerReference?: string; note?: string; allowReauthPrompt?: boolean },
  ) => {
    if (!backendDataLoaded || fundingExecutionPendingId) return;
    const providerReference = options?.providerReference ?? window.prompt("Enter the Kripicard support/ticket/reference that confirms this outcome:");
    if (!providerReference?.trim()) return;
    const note = options?.note ?? (window.prompt(outcome === "completed" ? "Optional resolution note:" : "Optional note explaining why it is safe to retry:") ?? "");
    setFundingExecutionPendingId(request.id);
    try {
      const result = await resolveFundingRequest(request.id, { outcome, providerReference: providerReference.trim(), note: note.trim() || null });
      await reloadFundingRequests();
      toast.success(result.status === "completed" ? "Funding marked completed from provider-confirmed reconciliation." : "Provider confirmed the card was not funded. The request is now safe for an explicit retry.");
    } catch (error) {
      if (
        options?.allowReauthPrompt !== false &&
        error instanceof AdminApiError &&
        error.code === "reauthentication_required"
      ) {
        queueFundingReauthentication(
          "Confirm funding reconciliation",
          "Manual provider-confirmed resolution changes the authoritative funding outcome. Re-enter your admin credentials, then AccAbad will retry this exact resolution without asking for the reference again.",
          () => resolveFundingOutcome(request, outcome, {
            providerReference: providerReference.trim(),
            note: note.trim(),
            allowReauthPrompt: false,
          }),
        );
      } else if (error instanceof AdminApiError && error.code === "mfa_required") {
        toast.error("Enable MFA in Settings → Security before resolving provider money operations.");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not resolve funding reconciliation.");
      }
    } finally {
      setFundingExecutionPendingId(null);
    }
  };

  const reloadSupportConversation = async (clientId: string) => {
    const result = await fetchClientSupportMessages(clientId);
    setMessages((current) => ({
      ...current,
      [clientId]: result.items.map((item) => ({
        id: item.id,
        from: item.direction === "client_to_admin" ? "client" : "admin",
        body: item.text,
        time: new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        status: item.status,
        lastDeliveryError: item.lastDeliveryError,
        attachment: item.attachment ? { filename: item.attachment.filename, downloadUrl: item.attachment.downloadUrl, mimeType: item.attachment.mimeType } : null,
      })),
    }));
    const summary = await fetchSupportConversations();
    setSupportConversations(summary.items);
  };

  const sendMessage = async () => {
    const body = chatDraft.trim();
    if ((!body && !supportAttachment) || !activeChatId) return;
    if (!backendDataLoaded) {
      toast.error("Backend unavailable. The message was not queued.");
      return;
    }
    try {
      await sendClientSupportMessage(activeChatId, body, supportAttachment);
      setChatDraft("");
      setSupportAttachment(null);
      await reloadSupportConversation(activeChatId);
      toast.success("Message persisted and queued for Telegram delivery.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the Telegram message.");
    }
  };

  const changeSupportConversation = async (action: "open" | "pending" | "closed" | "assign_me") => {
    if (!backendDataLoaded || !activeChatId) return;
    const conversation = supportConversations.find((item) => item.userId === activeChatId);
    if (!conversation) return;
    try {
      if (action === "assign_me") {
        const me = await fetchCurrentAdmin();
        if (!me) throw new Error("Admin session expired.");
        await updateSupportConversation(conversation.id, { assignedAdminId: me.id });
      } else {
        await updateSupportConversation(conversation.id, { status: action });
      }
      const summary = await fetchSupportConversations();
      setSupportConversations(summary.items);
      toast.success(action === "assign_me" ? "Conversation assigned to you." : `Conversation marked ${action}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Conversation update failed."); }
  };

  const retrySupportDelivery = async (messageId: string) => {
    try {
      await retrySupportMessage(messageId);
      if (activeChatId) await reloadSupportConversation(activeChatId);
      toast.success("Failed Telegram delivery was queued for retry.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry support delivery."); }
  };

  const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? "Not connected";
  const clientName = (id: string | null) => id ? clients.find((client) => client.id === id)?.name ?? "Unknown client" : "No Telegram user";
  const pendingRequestCount =
    fundingRequests.filter((request) => request.status === "pending_review" || request.status === "needs_reconciliation").length +
    kycPendingCount +
    clients.filter((client) => {
      const status = paymentStatusByUser[client.id];
      return status && status !== "complete" && status !== "denied";
    }).length;
  const unreadInboxCount = supportConversations.reduce((sum, c) => sum + (c.unreadAdminCount ?? 0), 0);
  const badgeFor = (view: View): number => (view === "requests" ? pendingRequestCount : view === "inbox" ? unreadInboxCount : 0);

  useEffect(() => {
    const valid: View[] = ["overview", "accounts", "clients", "requests", "inbox", "operations", "settings"];
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "") as View;
      if (valid.includes(hash)) setView(hash);
    };
    applyHash();
    window.addEventListener("popstate", applyHash);
    return () => window.removeEventListener("popstate", applyHash);
  }, []);

  const changeView = (nextView: View) => {
    setView(nextView);
    setSearch("");
    if (typeof window !== "undefined" && window.location.hash.replace(/^#/, "") !== nextView) {
      window.history.pushState({ view: nextView }, "", `#${nextView}`);
    }
  };

  return (
    <SidebarProvider className="app-shell" style={{ "--sidebar-width": "17rem" } as React.CSSProperties}>
      <AdminAttachmentViewer />
      <Sidebar collapsible="icon" className="app-sidebar border-r border-[#e8e6ef] bg-[#fbfbfd] text-[#706d82]">
        <SidebarHeader className="px-4 pb-5 pt-5">
          <button className="flex h-11 items-center gap-3 rounded-2xl px-1 text-left" onClick={() => changeView("overview")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#6157e7] text-white shadow-[0_8px_24px_rgba(97,87,231,.28)]">
              <CreditCard className="size-5" strokeWidth={2.4} />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block text-[16px] font-bold tracking-[-.025em] text-[#1b1930]">AccAbad Admin</span>
              <span className="block text-xs text-[#9894a8]">Operations console</span>
            </span>
          </button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#aaa6b8]">Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.view}>
                    <SidebarMenuButton
                      isActive={view === item.view}
                      tooltip={item.label}
                      onClick={() => changeView(item.view)}
                      className="h-11 rounded-[14px] px-3.5 text-[14px] font-medium text-[#77748a] hover:bg-[#f2f1f7] hover:text-[#29253d] data-[active=true]:bg-[#eeecff] data-[active=true]:font-semibold data-[active=true]:text-[#5146ca]"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {badgeFor(item.view) > 0 && <SidebarMenuBadge className="top-3 rounded-full bg-[#6157e7] text-white">{badgeFor(item.view)}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator className="bg-[#eceaf2]" />
        <SidebarFooter className="p-3.5">
          <div className="flex items-center gap-3 rounded-2xl border border-[#ebe9f1] bg-white p-2.5 shadow-[0_4px_18px_rgba(26,24,48,.04)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5">
            <Avatar className="size-9 border border-[#dedaff]">
              <AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5146ca]">AD</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-[#28253c]">Admin</p>
              <p className="truncate text-xs text-[#9b97aa]">Owner access</p>
            </div>
            <button type="button" title="Sign out" onClick={() => void logoutAdmin()} className="rounded-lg p-1.5 text-[#aaa6b8] transition hover:bg-red-50 hover:text-red-600 group-data-[collapsible=icon]:hidden"><LogOut className="size-4" /><span className="sr-only">Sign out</span></button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="app-canvas min-w-0">
        <header className="app-header sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-[#ebe9f1]/80 bg-[#f7f7fb]/85 px-4 backdrop-blur-2xl md:px-8">
          <SidebarTrigger className="size-9 rounded-xl border border-[#e4e2eb] bg-white text-[#6f6b80] shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] font-bold uppercase tracking-[.15em] text-[#aaa6b8] sm:block">Operations</p>
            <h1 className="truncate text-[15px] font-semibold tracking-[-.01em] text-[#242139]">{viewCopy[view].title}</h1>
          </div>
          <Badge variant="outline" className="hidden h-8 gap-2 rounded-full border-[#dedbf0] bg-white px-3 font-medium text-[#6a6579] lg:inline-flex"><span className="size-1.5 rounded-full bg-[#f2a33a]" />Provider writes off</Badge>
          <div className="relative hidden w-[min(30vw,340px)] sm:block">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9d99aa]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${viewCopy[view].title.toLowerCase()}`}
              className="h-10 rounded-[14px] border-[#e5e3ec] bg-white pl-10 shadow-[0_3px_14px_rgba(26,24,48,.035)] placeholder:text-[#aaa6b8]"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-[14px] border-[#e5e3ec] bg-white text-[#777287] shadow-sm"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            <span className="sr-only">Switch to {theme === "light" ? "dark" : "light"} theme</span>
          </Button>
          <Button variant="outline" size="icon" className="relative size-10 rounded-[14px] border-[#e5e3ec] bg-white text-[#777287] shadow-sm">
            <Bell className="size-4" />
            <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[#6157e7] ring-2 ring-white" />
            <span className="sr-only">Notifications</span>
          </Button>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1440px]">
            {!(["overview", "settings", "kyc"] as View[]).includes(view) && <div className="relative mb-4 sm:hidden"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9d99aa]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${viewCopy[view].title.toLowerCase()}`} className="h-11 rounded-[14px] border-[#e5e3ec] bg-white pl-10 shadow-sm" /></div>}
            {view === "overview" && (
              <OverviewV2
                clients={clients}
                kycByUser={kycStatusByUser}
                paymentByUser={paymentByUser}
                paymentStatusByUser={paymentStatusByUser}
                fundingRequests={fundingRequests}
                telegramStatus={telegramStatus}
                onViewChange={changeView}
                onOpenClient={setActiveClientId}
              />
            )}
            {view === "accounts" && (
              <AccountsView
                accounts={filteredAccounts}
                clients={clients}
                cards={cards}
                accountEmails={accountEmails}
                onAdd={openAddAccount}
                onOpen={setActiveAccountId}
                onFundCard={openFundCard}
                onCreateCard={openCreateCard}
                onEdit={openEditAccount}
                onRevealCredentials={revealCredentials}
                onSync={syncProviderAccount}
                onDelete={setDeleteAccountId}
              />
            )}
            {view === "clients" && (
              <ClientsView
                clients={filteredClients}
                cards={cards}
                onOpen={setActiveClientId}
                onToggleBan={toggleBan}
                accountName={accountName}
                kycStatusByUser={kycStatusByUser}
                onNotify={async (id) => {
                  try { await notifyClient(id); toast.success("Notification queued to the customer."); }
                  catch (error) { toast.error(error instanceof Error ? error.message : "Could not notify the customer."); }
                }}
              />
            )}
            {view === "requests" && (
              <RequestsView
                fundingRequests={fundingRequests}
                cardRequests={cardRequests}
                cardRequestPendingId={cardRequestPendingId}
                clientName={clientName}
                search={search}
                kycPendingCount={kycPendingCount}
                clients={clients}
                paymentStatusByUser={paymentStatusByUser}
                paymentPipelineByUser={paymentPipelineByUser}
                transactions={transactions}
                issues={transactionNotificationIssues}
                onReconcileIssue={reconcileNotificationIssue}
                onOpenRequest={setActiveRequestId}
                onReviewCardPayment={reviewAdditionalCardPayment}
                onReviewCardRequest={reviewAdditionalCardRequest}
                onIssueCardRequest={issueAdditionalCardRequest}
                onReconcileCardRequest={reconcileAdditionalCardRequest}
                onAttachCardRequest={attachAdditionalCardRequest}
                onOpenClient={setActiveClientId}
                onPaymentDecision={async (clientId, action) => {
                  try {
                    await activateClient(clientId, { action });
                    toast.success(action === "accept" ? "Receipt accepted. Continue with account selection and card creation." : "Receipt denied. The customer can upload a replacement.");
                    setPaymentPipelineTick((value) => value + 1);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not update the first-card payment.");
                  }
                }}
              />
            )}
            {view === "operations" && (
              <OperationsView snapshot={operationalSnapshot} onControlAction={async (key, enabled) => {
                const reason = window.prompt(`${enabled ? "Enable" : "Disable"} this runtime control. Enter an audit reason:`);
                if (!reason?.trim()) return;
                const password = window.prompt("Re-enter your AccAbad admin password:");
                if (!password) return;
                const code = window.prompt("If MFA is enabled, enter the 6-digit code. Otherwise leave this blank:") ?? "";
                try {
                  await reauthenticateAdmin(password, code || undefined);
                  await updateRuntimeControl(key, enabled, reason.trim());
                  setOperationalSnapshot(await fetchOperationalSnapshot());
                  toast.success("Emergency runtime control updated and audited.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Runtime control update failed.");
                }
              }} onAlertAction={async (id, action) => {
                try {
                  await updateOperationalAlert(id, action);
                  setOperationalSnapshot(await fetchOperationalSnapshot());
                  toast.success(action === "acknowledge" ? "Alert acknowledged." : "Alert resolved.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Alert update failed.");
                }
              }} />
            )}
            {view === "inbox" && (
              <InboxView
                clients={backendDataLoaded ? clients : clients.filter((client) => messages[client.id]?.length)}
                activeClient={activeChatClient}
                activeClientId={activeChatId}
                messages={messages[activeChatId] ?? []}
                draft={chatDraft}
                search={search}
                conversations={supportConversations}
                attachment={supportAttachment}
                onAttachment={setSupportAttachment}
                onDraftChange={setChatDraft}
                onSelect={setActiveChatId}
                onSend={sendMessage}
                onConversationAction={changeSupportConversation}
                onRetry={retrySupportDelivery}
                hasMore={msgHasMore[activeChatId] ?? false}
                onLoadOlder={() => void loadOlderMessages(activeChatId)}
              />
            )}
            {view === "settings" && (
              <SettingsView
                serviceFee={serviceFee}
                exchangeRate={exchangeRate}
                minimumFunding={minimumFunding}
                botToken={botToken}
                showToken={showToken}
                telegramStatus={telegramStatus}
                channels={channels}
                newChannel={newChannel}
                onServiceFee={setServiceFee}
                onExchangeRate={setExchangeRate}
                onMinimumFunding={(value) => setMinimumFunding(Math.max(1, value || 1))}
                onSavePricing={async () => {
                  try {
                    const saved = await updateFundingSettings({
                      serviceFeeBasisPoints: Math.round(serviceFee * 100),
                      minimumUsdCents: Math.round(minimumFunding * 100),
                      rialPerUsd: Math.round(exchangeRate),
                      rateValidMinutes: 240,
                    });
                    setServiceFee(saved.serviceFeeBasisPoints / 100);
                    setMinimumFunding(saved.minimumUsdCents / 100);
                    if (saved.rate) setExchangeRate(Number(saved.rate.rialPerUsd));
                    toast.success("Funding pricing saved and a new immutable manual exchange-rate snapshot was created.");
                  } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save funding pricing."); }
                }}
                onBotToken={setBotToken}
                onSaveBotToken={async () => {
                  const token = botToken.trim();
                  if (!token) { toast.error("Paste a bot token first."); return; }
                  try {
                    const result = await setTelegramBotToken(token);
                    setBotToken("");
                    const status = await fetchTelegramBotStatus();
                    setTelegramStatus(status);
                    toast.success(`Bot token saved (ending ${result.tokenHint}). Now click "Configure webhook".`);
                  } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the bot token."); }
                }}
                onClearBotToken={async () => {
                  try {
                    await clearTelegramBotToken();
                    setBotToken("");
                    const status = await fetchTelegramBotStatus();
                    setTelegramStatus(status);
                    toast.success("Stored bot token cleared.");
                  } catch (error) { toast.error(error instanceof Error ? error.message : "Could not clear the bot token."); }
                }}
                onShowToken={setShowToken}
                onConfigureWebhook={async () => {
                  try {
                    const result = await configureTelegramWebhook();
                    const status = await fetchTelegramBotStatus();
                    setTelegramStatus(status);
                    toast.success(`Telegram webhook configured at ${result.url}.`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not configure the Telegram webhook.");
                  }
                }}
                onNewChannel={setNewChannel}
                onAddChannel={async () => {
                  const raw = newChannel.trim();
                  if (!raw) return;
                  if (/^-?\d+$/.test(raw)) {
                    toast.info("Use a public @channel username here. Private/numeric channels require an invite URL and can be configured through the API.");
                    return;
                  }
                  const channel = raw.startsWith("@") ? raw : `@${raw}`;
                  if (channels.includes(channel)) return;
                  try {
                    await upsertForceJoinChannel({ chatId: channel, title: channel });
                    setChannels((current) => [...current, channel]);
                    setNewChannel("");
                    toast.success("Required channel added and persisted.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not add the required channel.");
                  }
                }}
                onRemoveChannel={async (channel) => {
                  try {
                    await deleteForceJoinChannel(channel);
                    setChannels((current) => current.filter((item) => item !== channel));
                    toast.success("Required channel removed.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not remove the required channel.");
                  }
                }}
              />
            )}
          </div>
        </main>
      </SidebarInset>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingAccountId ? "Update Kripicard account" : "Add Kripicard account"}</DialogTitle>
            <DialogDescription>Credentials are encrypted server-side. Existing passwords and API keys stay masked unless an authorized admin reauthenticates to reveal them.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="account-name">Account name</Label>
              <Input id="account-name" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Media Operations" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-owner">Kripicard login email</Label>
              <Input id="account-owner" type="email" value={accountForm.owner} onChange={(event) => setAccountForm((current) => ({ ...current, owner: event.target.value }))} placeholder="account@outlook.com or account@gmail.com" />
            </div>
            <div className="grid gap-2">
              <Label>Email provider</Label>
              <Select value={accountForm.mailProvider} onValueChange={(value) => setAccountForm((current) => ({ ...current, mailProvider: value as Account["mailProvider"] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Outlook / Hotmail">Outlook / Hotmail</SelectItem>
                  <SelectItem value="Gmail">Gmail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-mailbox">Connected inbox address <span className="font-normal text-slate-400">· optional</span></Label>
              <Input id="account-mailbox" type="email" value={accountForm.mailbox} onChange={(event) => setAccountForm((current) => ({ ...current, mailbox: event.target.value }))} placeholder="e.g. account-name@outlook.com" />
              <p className="text-xs leading-5 text-[#8f8b9c]">Leave blank and click Connect; OAuth will save the mailbox identity returned by the provider. The OAuth app credentials are global, while every connected account stores its own encrypted refresh token.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-password">Account password {editingAccountId && <span className="font-normal text-slate-400">· leave blank to keep current</span>}</Label>
              <Input id="account-password" type="password" value={accountForm.password} onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))} placeholder={editingAccountId ? "Leave blank to keep current" : "Kripicard account password"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-key">API key {editingAccountId && <span className="font-normal text-slate-400">· leave blank to keep current</span>}</Label>
              <Input id="account-key" type="password" value={accountForm.apiKey} onChange={(event) => setAccountForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Paste Kripicard API key" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAccountDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAccount} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]">{editingAccountId ? "Save changes" : "Connect account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteAccountId)} onOpenChange={(open) => !open && setDeleteAccountId(null)}>
        <AlertDialogContent className="rounded-[24px] border-[#e5e2ee] shadow-[0_28px_80px_rgba(26,24,48,.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this account connection?</AlertDialogTitle>
            <AlertDialogDescription>This archives the AccAbad connection and disables its mailbox authorization. It does not delete cards at Kripicard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeAccount}>Delete connection</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={Boolean(activeAccountId)} onOpenChange={(open) => !open && setActiveAccountId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#e7e4ed] bg-[#fbfafc] sm:max-w-[680px]">
          {activeAccount && (
            <>
              <SheetHeader className="border-b border-[#eceaf2] bg-white px-6 py-5">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div><SheetTitle className="text-lg">{activeAccount.name}</SheetTitle><SheetDescription>{activeAccount.owner} · synced {activeAccount.lastSync}</SheetDescription></div>
                  <Badge variant="outline" className={`${activeAccount.status === "Connected" ? "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]" : "border-[#f4d9aa] bg-[#fff5e4] text-[#a4600c]"} rounded-full`}>{activeAccount.status}</Badge>
                </div>
              </SheetHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-[17px] border border-[#eceaf2] bg-white p-4"><p className="text-xs text-[#8f8b9c]">Account balance</p><p className="mt-1 text-lg font-semibold">{formatOptionalUsd(activeAccount.accountBalance)}</p><p className="mt-1 text-[11px] text-[#aaa6b8]">Visible for future actions · not used now</p></div>
                  <div className="rounded-[17px] border border-[#eceaf2] bg-white p-4"><p className="text-xs text-[#8f8b9c]">Total on cards</p><p className="mt-1 text-lg font-semibold">{formatUsd(activeAccount.cardBalance)}</p></div>
                  <div className="rounded-[17px] border border-[#eceaf2] bg-white p-4"><p className="text-xs text-[#8f8b9c]">Cards in account</p><p className="mt-1 text-lg font-semibold">{activeAccountCards.length}</p></div>
                  <div className="rounded-[17px] border border-[#eceaf2] bg-white p-4"><p className="text-xs text-[#8f8b9c]">Telegram access</p><p className="mt-1 truncate text-sm font-semibold">{activeAccountClient?.name ?? "Unassigned"}</p></div>
                </div>
                <div className="space-y-3 rounded-[17px] border border-[#dedaf4] bg-[#f4f2ff] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-white text-[#6157e7]"><Mail className="size-5" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#302d43]">{activeAccount.mailbox}</p><p className="mt-0.5 text-xs text-[#777287]">{activeAccount.mailProvider} · {activeAccount.emailConnectionStatus === "connected" ? `connected${activeAccount.emailProviderIdentity ? ` as ${activeAccount.emailProviderIdentity}` : ""}` : activeAccount.emailConnectionStatus === "reauth_required" ? "reconnect required" : activeAccount.emailConnectionStatus === "error" ? "sync error" : "not connected"}</p></div>
                    <Badge variant="outline" className="rounded-full border-[#d8d3ff] bg-white text-[#5549ca]">{activeAccountEmails.filter((email) => email.unread).length} unread</Badge>
                    {backendDataLoaded && activeAccount.emailConnectionStatus === "connected" && <Button size="sm" variant="outline" disabled={emailActionPendingId === activeAccount.id} onClick={() => void reclassifyActiveAccountEmail()} className="rounded-xl"><ShieldCheck className="size-4" />Reclassify</Button>}
                  </div>
                  {backendDataLoaded && activeAccount.mailProvider === "Outlook / Hotmail" && <div className="flex flex-wrap items-center gap-2 border-t border-[#ddd9f5] pt-3">
                    {activeAccount.emailConnectionStatus !== "connected" ? <Button size="sm" disabled={emailActionPendingId === activeAccount.id} onClick={() => void connectOutlook(activeAccount)} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><Mail className="size-4" />{activeAccount.emailConnectionStatus === "reauth_required" ? "Reconnect Outlook" : "Connect Outlook"}</Button> : <>
                      <Button size="sm" variant="outline" disabled={emailActionPendingId === activeAccount.id} onClick={() => void syncOutlook(activeAccount)} className="rounded-xl"><RefreshCw className="size-4" />{emailActionPendingId === activeAccount.id ? "Syncing…" : "Sync inbox"}</Button>
                      <Button size="sm" variant="outline" disabled={emailActionPendingId === activeAccount.id} onClick={() => void disconnectOutlook(activeAccount)} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">Disconnect</Button>
                    </>}
                    <span className="text-xs text-[#8f8b9c]">{activeAccount.emailLastSyncedAt ? `Last inbox sync ${formatApiDateTime(activeAccount.emailLastSyncedAt)}` : "No inbox sync yet"}</span>
                  </div>}
                  {backendDataLoaded && activeAccount.mailProvider === "Gmail" && <div className="flex flex-wrap items-center gap-2 border-t border-[#ddd9f5] pt-3">
                    {activeAccount.emailConnectionStatus !== "connected" ? <Button size="sm" disabled={emailActionPendingId === activeAccount.id} onClick={() => void connectGmail(activeAccount)} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><Mail className="size-4" />{activeAccount.emailConnectionStatus === "reauth_required" ? "Reconnect Gmail" : "Connect Gmail"}</Button> : <>
                      <Button size="sm" variant="outline" disabled={emailActionPendingId === activeAccount.id} onClick={() => void syncGmail(activeAccount)} className="rounded-xl"><RefreshCw className="size-4" />{emailActionPendingId === activeAccount.id ? "Syncing…" : "Sync inbox"}</Button>
                      <Button size="sm" variant="outline" disabled={emailActionPendingId === activeAccount.id} onClick={() => void disconnectGmail(activeAccount)} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">Disconnect</Button>
                    </>}
                    <span className="text-xs text-[#8f8b9c]">{activeAccount.emailLastSyncedAt ? `Last inbox sync ${formatApiDateTime(activeAccount.emailLastSyncedAt)}` : "No inbox sync yet"}</span>
                  </div>}
                  {activeAccount.emailError && <p className="text-xs text-red-700">{activeAccount.emailError}</p>}
                </div>
                <Tabs defaultValue="cards">
                  <TabsList className="h-11 rounded-[14px] border border-[#e7e5ef] bg-white p-1">
                    <TabsTrigger value="cards" className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]">Cards <Badge variant="outline" className="ml-1.5 rounded-full">{activeAccountCards.length}</Badge></TabsTrigger>
                    <TabsTrigger value="mail" className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]">Inbox <Badge variant="outline" className="ml-1.5 rounded-full">{activeAccountEmails.length}</Badge></TabsTrigger>
                  </TabsList>
                  <TabsContent value="cards" className="mt-4 space-y-3">
                    {accountCardPaging.pageItems.map((card) => (
                      <div key={card.id} className="rounded-[19px] border border-[#e8e6ef] bg-white p-4 shadow-[0_6px_20px_rgba(26,24,48,.03)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><CreditCard className="size-5" /></span><div><p className="font-semibold text-[#302d43]">{card.label} · •{card.last4}</p><p className="mt-1 text-xs text-[#9692a3]">{card.cardholder} · BIN {card.bin} · expires {card.expiry}</p></div></div>
                          <Badge variant="outline" className={card.frozen ? "border-slate-200 bg-slate-100 text-slate-600" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{card.frozen ? "Frozen" : "Active"}</Badge>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#efedf3] pt-3"><div><p className="text-xs text-[#9692a3]">Card balance</p><p className="font-semibold">{formatUsd(card.balance)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-xl" disabled={cardStatePendingId === card.id} onClick={() => void toggleCard(card.id)}>{card.frozen ? <Unlock className="size-4" /> : <Snowflake className="size-4" />}{card.frozen ? "Unfreeze" : "Freeze"}</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setLiveCardDetails(null); setActiveCardId(card.id); }}><Eye className="size-4" />Details</Button></div></div>
                      </div>
                    ))}
                    {!activeAccountCardMatches.length && <div className="rounded-[18px] border border-dashed bg-white p-8 text-center"><CreditCard className="mx-auto size-7 text-[#c1bdcc]" /><p className="mt-2 text-sm font-medium">{search ? "No matching cards" : "No cards in this account"}</p></div>}
                    <ListPagination page={accountCardPaging.page} pageSize={accountCardPaging.pageSize} totalItems={accountCardPaging.totalItems} totalPages={accountCardPaging.totalPages} onPageChange={accountCardPaging.setPage} />
                  </TabsContent>
                  <TabsContent value="mail" className="mt-4 space-y-3">
                    {accountEmailPaging.pageItems.map((email) => (
                      <button key={email.id} onClick={() => openAccountEmail(email.id)} className="flex w-full items-start gap-3 rounded-[18px] border border-[#e8e6ef] bg-white p-4 text-left transition hover:border-[#d9d5ef] hover:bg-[#faf9ff]">
                        <span className={`mt-1 size-2 shrink-0 rounded-full ${email.unread ? "bg-[#6157e7]" : "bg-[#d8d5df]"}`} />
                        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-[#302d43]">{email.subject}</span><Badge variant="outline" className={`${email.category === "3DS" ? "border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]" : email.category === "Security" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"} rounded-full text-[10px]`}>{email.category}</Badge></span><span className="mt-1 block truncate text-xs text-[#9692a3]">{email.sender}</span><span className="mt-2 block truncate text-sm text-[#777287]">{email.preview}</span></span>
                        <span className="shrink-0 text-xs text-[#aaa6b8]">{email.received}</span>
                      </button>
                    ))}
                    {!activeAccountEmailMatches.length && <div className="rounded-[18px] border border-dashed bg-white p-8 text-center"><Mail className="mx-auto size-7 text-[#c1bdcc]" /><p className="mt-2 text-sm font-medium">{search ? "No matching messages" : "Inbox is empty"}</p><p className="mt-1 text-xs text-[#9692a3]">New provider and 3DS messages will appear here.</p></div>}
                    <ListPagination page={accountEmailPaging.page} pageSize={accountEmailPaging.pageSize} totalItems={accountEmailPaging.totalItems} totalPages={accountEmailPaging.totalPages} onPageChange={accountEmailPaging.setPage} />
                    <p className="px-1 text-xs leading-5 text-[#9692a3]">Telegram users never see this inbox. Only an extracted 3DS code for a card they can currently access is delivered to the bot.</p>
                  </TabsContent>
                </Tabs>
              </div>
              <SheetFooter className="flex-wrap border-t border-[#eceaf2] bg-white px-6 py-4"><Button variant="outline" onClick={() => openEditAccount(activeAccount)} className="rounded-xl"><PencilLine className="size-4" />Edit connection</Button></SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(activeAccountEmailId)} onOpenChange={(open) => !open && setActiveAccountEmailId(null)}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[620px]">
          {activeAccountEmail && <><DialogHeader><div className="flex items-center gap-2"><Badge variant="outline" className="rounded-full">{activeAccountEmail.category}</Badge>{activeAccountEmail.cardLast4 && <Badge variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">Card •{activeAccountEmail.cardLast4}</Badge>}</div><DialogTitle className="pt-2">{activeAccountEmail.subject}</DialogTitle><DialogDescription>From {activeAccountEmail.sender} · received {activeAccountEmail.received}</DialogDescription></DialogHeader><div className="rounded-[18px] border border-[#e8e6ef] bg-[#faf9fc] p-5 text-sm leading-7 text-[#494558]">{activeAccountEmail.body}</div>{activeAccountEmail.parserNote && <p className="text-xs text-[#8f8b9c]">{activeAccountEmail.parserNote}</p>}<DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setActiveAccountEmailId(null)}>Close</Button>{activeAccountEmail.otpAvailable && <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => void revealActiveEmailOtp()}><KeyRound className="size-4" />Reveal OTP{activeAccountEmail.otpCodeLast2 ? ` · ••${activeAccountEmail.otpCodeLast2}` : ""}</Button>}</DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeCardId)} onOpenChange={(open) => { if (!open) { setActiveCardId(null); setLiveCardDetails(null); } }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[580px]">
          {activeCard && <><DialogHeader><DialogTitle>{activeCard.label} · •{activeCard.last4}</DialogTitle><DialogDescription>Live card details are retrieved from the Kripicard account that owns this card.</DialogDescription></DialogHeader><dl className="grid gap-3 rounded-[18px] border border-[#e8e6ef] bg-[#faf9fc] p-5 text-sm sm:grid-cols-2"><div><dt className="text-[#9692a3]">Card ID</dt><dd className="mt-1 font-mono font-semibold">{activeCard.providerCardId ?? activeCard.id}</dd></div><div><dt className="text-[#9692a3]">BIN / last four</dt><dd className="mt-1 font-semibold">{activeCard.bin} · •{activeCard.last4}</dd></div><div><dt className="text-[#9692a3]">Cardholder</dt><dd className="mt-1 font-semibold">{activeCard.cardholder}</dd></div><div><dt className="text-[#9692a3]">Expiry</dt><dd className="mt-1 font-semibold">{activeCard.expiry}</dd></div><div><dt className="text-[#9692a3]">Balance</dt><dd className="mt-1 font-semibold">{formatUsd(activeCard.balance)}</dd></div><div><dt className="text-[#9692a3]">Status</dt><dd className="mt-1 font-semibold">{activeCard.frozen ? "Frozen" : "Active"}</dd></div><div className="sm:col-span-2"><dt className="text-[#9692a3]">3DS delivery address</dt><dd className="mt-1 break-all font-semibold">{activeCard.email}</dd></div></dl>{liveCardDetails && <div className="grid gap-3 rounded-[18px] border border-amber-200 bg-amber-50 p-5 text-sm sm:grid-cols-3"><div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">Live card number</p><p className="mt-1 break-all font-mono text-base font-bold text-amber-950">{liveCardDetails.cardNumber}</p></div><div><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">CVV</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{liveCardDetails.cvv}</p></div><div><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">Expiry</p><p className="mt-1 font-semibold text-amber-950">{liveCardDetails.expiry}</p></div><div className="sm:col-span-2"><p className="text-xs text-amber-700">Sensitive details auto-hide after 30 seconds and are not written to the AccAbad database.</p></div></div>}{backendDataLoaded && <div className="rounded-[18px] border border-[#e8e6ef] bg-white p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-[#353146]">Stored provider transactions</p><p className="text-xs text-[#9692a3]">Synced from Kripicard and deduplicated in PostgreSQL.</p></div><Badge variant="outline" className="rounded-full">{activeCardTransactions.length}</Badge></div><div className="max-h-52 space-y-2 overflow-y-auto">{activeCardTransactions.slice(0, 20).map((tx) => <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0eef4] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{tx.merchant || tx.type || "Provider transaction"}</p><p className="text-xs text-[#9692a3]">{new Date(tx.occurredAt).toLocaleString()} · {tx.type || "Unknown"} · {tx.status}</p></div><span className="shrink-0 text-sm font-semibold">{formatUsd(Number(tx.amountMinor) / 100)}</span></div>)}{activeCardTransactions.length === 0 && <p className="rounded-xl border border-dashed p-3 text-center text-sm text-[#9692a3]">No synchronized transactions yet. Use Sync transactions.</p>}</div></div>}<Alert className="border-[#ddd9f5] bg-[#f3f1ff]"><ShieldCheck className="text-[#6157e7]" /><AlertTitle>Protected card data</AlertTitle><AlertDescription>AccAbad fetches PAN, expiry, and CVV from Kripicard only after an explicit, reauthenticated reveal. They are never persisted to PostgreSQL and are cleared from this view automatically.</AlertDescription></Alert><DialogFooter><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => { setActiveCardId(null); setView("requests"); }}><CircleDollarSign className="size-4" />Open funding requests</Button><Button variant="outline" className="rounded-xl" disabled={cardStatePendingId === activeCard.id} onClick={() => void toggleCard(activeCard.id)}>{activeCard.frozen ? <Unlock className="size-4" /> : <Snowflake className="size-4" />}{cardStatePendingId === activeCard.id ? "Working…" : activeCard.frozen ? "Unfreeze" : "Freeze"}</Button><Button variant="outline" className="rounded-xl" disabled={cardStatePendingId === activeCard.id} onClick={() => void refreshProviderCardStatus(activeCard)}><RefreshCw className="size-4" />Refresh status</Button><Button variant="outline" className="rounded-xl" onClick={() => void revealProviderCardDetails(activeCard)}><Eye className="size-4" />Reveal number & CVV</Button><Button variant="outline" className="rounded-xl" onClick={() => void syncProviderCardTransactions(activeCard)}><ArrowLeftRight className="size-4" />Sync transactions</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(activeClientId)} onOpenChange={(open) => !open && setActiveClientId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#e7e4ed] bg-[#fbfafc] sm:max-w-xl">
          {activeClient && (
            <>
              <ClientPaymentSection key={`onboarding-${activeClientId ?? "none"}`} clientId={activeClientId} />
              <ClientKycSection key={`kyc-${activeClientId ?? "none"}`} clientId={activeClientId} />
              <SheetHeader className="border-b border-[#eceaf2] bg-white px-6 py-5">
                <div className="flex items-center gap-3 pr-8">
                  <Avatar className="size-11"><AvatarFallback className="bg-[#eeecff] font-bold text-[#5b50d6]">{initials(activeClient.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-lg">{activeClient.name}</SheetTitle>
                    <SheetDescription>{activeClient.username} · Telegram {activeClient.telegramId}</SheetDescription>
                  </div>
                  <Button asChild size="sm" className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><Link href={`/clients/${activeClient.id}`}>Open full page<ChevronRight className="size-4" /></Link></Button>
                </div>
              </SheetHeader>
              <div className="space-y-6 px-6 py-5">
                <div className="grid gap-2">
                  <Label>Kripicard account</Label>
                  {activeClient.accountIds.length
                    ? <div className="flex flex-wrap gap-2">{activeClient.accountIds.map((id) => <Badge key={id} variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">{accountName(id)}</Badge>)}</div>
                    : <p className="text-sm text-amber-700">Not assigned yet. After accepting the receipt, choose the account in the First-card onboarding panel above and click Create first card.</p>}
                  <p className="text-xs leading-5 text-[#9692a3]">Account assignment is performed by first-card creation so it cannot bypass KYC and payment approval.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] border border-[#eceaf2] bg-white p-4"><p className="text-sm text-[#8f8b9c]">Total funded</p><p className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#302d43]">{formatUsd(activeClient.totalFunded)}</p></div>
                  <div className="rounded-[18px] border border-[#eceaf2] bg-white p-4"><p className="text-sm text-[#8f8b9c]">Accessible cards</p><p className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#302d43]">{activeClientCards.length}</p></div>
                </div>
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Cards</h3><span className="text-sm text-slate-500">Client: view/freeze · Admin: add funds</span></div>
                  {activeClientCards.length ? (
                    <div className="space-y-3">
                      {clientCardPaging.pageItems.map((card) => (
                        <div key={card.id} className="rounded-[20px] border border-[#e8e6ef] bg-white p-4 shadow-[0_8px_24px_rgba(26,24,48,.035)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex gap-3">
                              <span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><CreditCard className="size-5" /></span>
                              <div><p className="font-medium">{card.label} · •{card.last4}</p><p className="mt-0.5 text-sm text-slate-500">{accountName(card.accountId)} · expires {card.expiry} · {card.id}</p></div>
                            </div>
                            <Badge variant="outline" className={card.frozen ? "border-slate-200 bg-slate-100 text-slate-600" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{card.frozen ? "Frozen" : "Active"}</Badge>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                            <p className="text-lg font-semibold">{formatUsd(card.balance)}</p>
                            <div className="flex gap-2"><Button size="sm" className="bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => openFundCard(card.id)}><CircleDollarSign className="size-4" />Add funds</Button><Button variant="outline" size="sm" disabled={cardStatePendingId === card.id} onClick={() => void toggleCard(card.id)}>
                              {card.frozen ? <Unlock className="size-4" /> : <Snowflake className="size-4" />}
                              {card.frozen ? "Unfreeze" : "Freeze"}
                            </Button></div>
                          </div>
                        </div>
                      ))}
                      <ListPagination page={clientCardPaging.page} pageSize={clientCardPaging.pageSize} totalItems={clientCardPaging.totalItems} totalPages={clientCardPaging.totalPages} onPageChange={clientCardPaging.setPage} />
                    </div>
                  ) : <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">{activeClient.accountIds.length ? "No cards exist in the connected account yet." : "No Kripicard account is assigned yet. Complete first-card onboarding to assign one."}</div>}
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">Recent transactions</h3>
                  <div className="space-y-2">
                    {clientTransactionPaging.pageItems.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between rounded-[14px] border border-[#eeecf3] bg-white px-3 py-3">
                        <div><p className="text-sm font-medium">{tx.merchant}</p><p className="text-xs text-slate-500">{tx.date} · •{tx.cardLast4}</p></div>
                        <span className={tx.amount > 0 ? "font-semibold text-emerald-700" : "font-semibold text-slate-800"}>{tx.amount > 0 ? "+" : ""}{formatUsd(tx.amount)}</span>
                      </div>
                    ))}
                    <ListPagination page={clientTransactionPaging.page} pageSize={clientTransactionPaging.pageSize} totalItems={clientTransactionPaging.totalItems} totalPages={clientTransactionPaging.totalPages} onPageChange={clientTransactionPaging.setPage} />
                  </div>
                </div>
              </div>
              <SheetFooter className="border-t border-[#eceaf2] bg-white px-6 py-4">
                <Button variant={activeClient.banned ? "outline" : "destructive"} onClick={() => toggleBan(activeClient.id)}>
                  {activeClient.banned ? <UserRoundCheck className="size-4" /> : <Ban className="size-4" />}
                  {activeClient.banned ? "Unban from bot" : "Ban from bot"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(activeRequestId)} onOpenChange={(open) => !open && setActiveRequestId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#e7e4ed] bg-[#fbfafc] sm:max-w-[580px]">
          {activeRequest && (
            <>
              <SheetHeader className="border-b border-[#eceaf2] bg-white px-6 py-5">
                <div className="flex items-center justify-between gap-3 pr-8">
                  <div><SheetTitle className="text-lg">{activeRequest.reference ?? activeRequest.id}</SheetTitle><SheetDescription>{clientName(activeRequest.clientId)} · card •{activeRequest.cardLast4}</SheetDescription></div>
                  <StatusBadge status={activeRequest.status} />
                </div>
              </SheetHeader>
              <div className="space-y-6 px-6 py-5">
                <div className="hero-grid rounded-[22px] p-5 text-white shadow-[0_16px_38px_rgba(31,27,63,.13)]">
                  <p className="text-sm text-[#b7b2d0]">Amount requested</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-.04em]">{formatUsd(activeRequest.amount)}</p>
                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
                    <div><p className="text-[#aaa5c8]">Client pays</p><p className="mt-1 font-medium text-[#c8c3ff]">{formatRial(activeRequest.rialTotal)}</p></div>
                    <div><p className="text-[#aaa5c8]">Submitted</p><p className="mt-1 font-medium">{activeRequest.submitted}</p></div>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">Payment calculation</h3>
                  <div className="space-y-2 rounded-[18px] border border-[#e8e6ef] bg-white p-4 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Card funding</span><span>{formatUsd(activeRequest.amount)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Provider fee snapshot (4% + $1)</span><span>{formatUsd(activeRequest.providerFee)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Service fee snapshot ({((activeRequest.serviceFeeBasisPoints ?? Math.round(serviceFee * 100)) / 100).toFixed(2)}%)</span><span>{formatUsd(activeRequest.serviceFee)}</span></div>
                    <div className="flex justify-between border-t pt-2 font-semibold"><span>Total USD basis</span><span>{formatUsd(activeRequest.amount + activeRequest.providerFee + activeRequest.serviceFee)}</span></div>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">Receipt</h3>
                  <button disabled={!backendDataLoaded || !activeRequest.receiptScanStatus || activeRequest.receiptScanStatus !== "clean"} onClick={() => backendDataLoaded && openAdminAttachment({ url: fundingReceiptDownloadUrl(activeRequest.id), title: `Funding receipt · ${activeRequest.reference ?? activeRequest.id}`, filename: activeRequest.receipt })} className="flex w-full items-center gap-3 rounded-[18px] border border-[#e8e6ef] bg-white p-4 text-left transition hover:border-[#d7d2f5] hover:bg-[#f8f6ff] disabled:cursor-not-allowed disabled:opacity-60">
                    <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><ReceiptIcon type={activeRequest.receiptType} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{activeRequest.receipt}</span><span className="block text-xs text-slate-500">{activeRequest.receiptScanStatus ? `Validation: ${activeRequest.receiptScanStatus}` : "No receipt uploaded"}</span></span>
                    <Eye className="size-4 text-slate-400" />
                  </button>
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">Client-visible progress</h3>
                  {(["rejected", "cancelled"] as FundingStatus[]).includes(activeRequest.status) ? (
                    <Alert variant="destructive"><XCircle /><AlertTitle>Payment rejected</AlertTitle><AlertDescription>The client sees the rejection and your optional explanation in Telegram.</AlertDescription></Alert>
                  ) : (
                    <div className="space-y-4">
                      <Progress value={fundingMeta[activeRequest.status].step * 25} className="h-2" />
                      <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
                        {["Review", "Accepted", "Funding", "Complete"].map((label, index) => <div key={label} className={index < fundingMeta[activeRequest.status].step ? "font-medium text-slate-900" : ""}>{label}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <SheetFooter className="border-t border-[#eceaf2] bg-white px-6 py-4 sm:flex-row">
                {!(["completed", "rejected", "cancelled"] as FundingStatus[]).includes(activeRequest.status) && (
                  <>
                    {(["pending_review", "correction_needed"] as FundingStatus[]).includes(activeRequest.status) && <Button variant="outline" className="rounded-xl text-red-700" onClick={() => setRejectDialogOpen(true)}>Reject</Button>}
                    {activeRequest.status === "pending_review" ? <><Button variant="outline" className="rounded-xl" onClick={() => void requestFundingCorrection()}>Request correction</Button><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => void advanceRequest(activeRequest)}>Accept payment<ChevronRight className="size-4" /></Button></> : activeRequest.status === "accepted" || activeRequest.status === "funding_failed" ? <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void openFundingWalletGate(activeRequest)}><WalletCards className="size-4" />{fundingExecutionPendingId === activeRequest.id ? "Preparing…" : activeRequest.status === "funding_failed" ? "Prepare crypto & retry" : "Prepare crypto funding"}</Button> : activeRequest.status === "needs_reconciliation" ? <><Button variant="outline" className="rounded-xl border-amber-300 bg-amber-50 text-amber-900" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void executeAcceptedFunding(activeRequest, "reconcile")}><RefreshCw className="size-4" />Recheck provider state</Button><Button variant="outline" className="rounded-xl" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void resolveFundingOutcome(activeRequest, "not_funded")}>Provider confirms not funded</Button><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void resolveFundingOutcome(activeRequest, "completed")}>Provider confirms funded</Button></> : activeRequest.status === "funding" ? <Button variant="outline" className="rounded-xl" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void executeAcceptedFunding(activeRequest, "reconcile")}><RefreshCw className={`size-4 ${fundingExecutionPendingId === activeRequest.id ? "animate-spin" : ""}`} />{fundingExecutionPendingId === activeRequest.id ? "Checking…" : "Recheck if stuck"}</Button> : null}
                  </>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(fundingWalletGate)} onOpenChange={(open) => { if (!open) { setFundingWalletGate(null); setFundingWalletConfirmed(false); } }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Fund Kripicard wallet with crypto</DialogTitle><DialogDescription>Kripicard card funding debits the account wallet. AccAbad cannot read that wallet balance, so complete the crypto deposit in Kripicard before the one-shot provider call.</DialogDescription></DialogHeader>
          {fundingWalletGate && <div className="space-y-4"><div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="font-semibold">{fundingWalletGate.details.accountLabel}</p><p className="text-xs text-[#777287]">{fundingWalletGate.details.loginEmail}</p><p className="mt-2">Required card amount: <b>{formatUsd(fundingWalletGate.request.amount)}</b></p><p className="text-xs text-[#777287]">Also cover the Kripicard provider fee shown on the request.</p></div><a href={fundingWalletGate.details.portalUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full rounded-xl"><ExternalLink className="size-4" />Open Kripicard crypto deposit</Button></a><label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={fundingWalletConfirmed} onCheckedChange={(value) => setFundingWalletConfirmed(value === true)} /><span>I deposited crypto into this exact Kripicard account and waited for it to be credited.</span></label></div>}
          <DialogFooter><Button variant="outline" onClick={() => setFundingWalletGate(null)}>Cancel</Button><Button disabled={!fundingWalletConfirmed || !fundingWalletGate} onClick={() => { const request = fundingWalletGate?.request; setFundingWalletGate(null); setFundingWalletConfirmed(false); if (request) void executeAcceptedFunding(request, "fund", { walletFundingConfirmed: true }); }}>Continue to fund card</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)]">
          <DialogHeader><DialogTitle>Reject funding request?</DialogTitle><DialogDescription>The request will stop and the client will be notified in Telegram.</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="reject-note">Message to client</Label><Textarea id="reject-note" value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Explain what needs to be corrected, if anything." /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={rejectRequest}>Reject and notify</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(fundingReauth)} onOpenChange={(open) => {
        if (!open && !fundingReauthBusy) {
          setFundingReauth(null);
          fundingReauthRetryRef.current = null;
          setFundingReauthPassword("");
          setFundingReauthCode("");
        }
      }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] sm:max-w-[430px]">
          <DialogHeader>
            <DialogTitle>{fundingReauth?.title ?? "Confirm privileged action"}</DialogTitle>
            <DialogDescription>{fundingReauth?.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="funding-reauth-password">Admin password</Label>
              <Input id="funding-reauth-password" type="password" autoComplete="current-password" value={fundingReauthPassword} onChange={(event) => setFundingReauthPassword(event.target.value)} disabled={fundingReauthBusy} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="funding-reauth-code">MFA code <span className="font-normal text-[#9692a3]">(if enabled)</span></Label>
              <Input id="funding-reauth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={fundingReauthCode} onChange={(event) => setFundingReauthCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={fundingReauthBusy} placeholder="123456" onKeyDown={(event) => { if (event.key === "Enter" && fundingReauthPassword.trim()) void submitFundingReauthentication(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" disabled={fundingReauthBusy} onClick={() => {
              setFundingReauth(null);
              fundingReauthRetryRef.current = null;
              setFundingReauthPassword("");
              setFundingReauthCode("");
            }}>Cancel</Button>
            <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={fundingReauthBusy || !fundingReauthPassword.trim()} onClick={() => void submitFundingReauthentication()}>
              {fundingReauthBusy ? "Verifying…" : "Reauthenticate & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}

function KycDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9692a3]">{label}</p>
      <p className="mt-1 break-words text-sm text-[#2c2940]">{value}</p>
    </div>
  );
}

function KycView() {
  const [items, setItems] = useState<ApiKycSubmission[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<ApiKycSubmission | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchKycSubmissions({ status: filter, search: search || undefined, limit: 50 }, controller.signal)
      .then((res) => {
        setItems(res.items);
        setNextCursor(res.nextCursor);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error(error instanceof AdminApiError ? error.message : "Could not load KYC submissions.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, search, tick]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchKycSubmissions({ status: filter, search: search || undefined, limit: 50, cursor: nextCursor });
      setItems((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (error) {
      toast.error(error instanceof AdminApiError ? error.message : "Could not load more KYC submissions.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      await reviewKycSubmission(selected.id, { decision, note: note.trim() || null });
      toast.success(decision === "approve" ? "Customer approved." : "Customer rejected.");
      setSelected(null);
      setNote("");
      setLoading(true);
      setNextCursor(null);
      setTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof AdminApiError ? error.message : "Could not update the submission.");
    } finally {
      setBusy(false);
    }
  }

  const filters: Array<{ id: "pending" | "approved" | "rejected" | "all"; label: string }> = [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "all", label: "All" },
  ];

  const badgeClass = (s: ApiKycSubmission["status"]) =>
    s === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : s === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <div>
      <PageIntro
        title="Customer KYC"
        description="Identity verifications submitted through the Telegram bot. Review who your customers are."
        action={<Button variant="outline" className="rounded-xl" onClick={() => { setLoading(true); setNextCursor(null); setTick((t) => t + 1); }}><RefreshCw className="size-4" />Refresh</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button key={f.id} variant={filter === f.id ? "default" : "outline"} className="rounded-full" onClick={() => { setFilter(f.id); setLoading(true); setNextCursor(null); }}>{f.label}</Button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9d99aa]" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setLoading(true); setNextCursor(null); }} placeholder="Search name, ID, phone…" className="h-11 rounded-[14px] border-[#e5e3ec] bg-white pl-10 shadow-sm" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="surface-card rounded-[20px]">
          <CardHeader><CardTitle className="text-[16px]">Submissions {items.length ? <span className="text-[#9692a3]">({items.length})</span> : null}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#9692a3]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#9692a3]">No {filter === "all" ? "" : `${filter} `}submissions.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setSelected(item); setNote(item.reviewNote ?? ""); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-[16px] border p-3 text-left transition ${selected?.id === item.id ? "border-[#6157e7] bg-[#f6f5ff]" : "border-[#ece9f2] bg-white hover:bg-[#faf9fc]"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2c2940]">{item.fullName}</p>
                    <p className="truncate text-xs text-[#8f8b9c]">{item.country} · {item.customer.username ? `@${item.customer.username}` : item.customer.displayName ?? `TG ${item.customer.telegramUserId}`}</p>
                  </div>
                  {item.hasDocument && <Paperclip className="size-3.5 shrink-0 text-[#9692a3]" />}<Badge variant="outline" className={`shrink-0 rounded-full ${badgeClass(item.status)}`}>{item.status}</Badge>
                </button>
              ))
            )}
            {nextCursor && !loading && <Button variant="outline" className="w-full rounded-xl" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more submissions"}</Button>}
          </CardContent>
        </Card>

        <Card className="surface-card rounded-[20px]">
          <CardHeader><CardTitle className="text-[16px]">Detail</CardTitle></CardHeader>
          <CardContent>
            {!selected ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#9692a3]">Select a submission to review it.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <KycDetailField label="Full name" value={selected.fullName} />
                  <KycDetailField label="Date of birth" value={selected.dateOfBirth ?? "—"} />
                  <KycDetailField label="Country" value={selected.country} />
                  <KycDetailField label="National ID" value={selected.nationalId} />
                  <KycDetailField label="Phone" value={selected.phone} />
                  <KycDetailField label="Delivery country" value={selected.deliveryCountry ?? "—"} />
                  <KycDetailField label="Province / state" value={selected.deliveryProvince ?? "—"} />
                  <KycDetailField label="City" value={selected.deliveryCity ?? "—"} />
                  <KycDetailField label="Postal / ZIP" value={selected.deliveryPostalCode ?? "—"} />
                  <KycDetailField label="Telegram" value={selected.customer.username ? `@${selected.customer.username}` : selected.customer.displayName ?? `ID ${selected.customer.telegramUserId}`} />
                  <div className="sm:col-span-2"><KycDetailField label="Card delivery address" value={selected.deliveryAddressLine ?? "—"} /></div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9692a3]">ID document</p>
                  {selected.hasDocument ? (
                    selected.documentMimeType?.startsWith("image/") ? (
                      <button type="button" className="block w-full cursor-zoom-in rounded-[16px]" onClick={() => openAdminAttachment({ url: kycDocumentUrl(selected.id), title: `KYC document · ${selected.fullName}`, filename: selected.documentFilename, mimeType: selected.documentMimeType })}><Image unoptimized width={1200} height={800} src={kycDocumentUrl(selected.id)} alt="KYC document" className="max-h-72 w-full rounded-[16px] border border-[#ece9f2] object-contain" /></button>
                    ) : (
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => openAdminAttachment({ url: kycDocumentUrl(selected.id), title: `KYC document · ${selected.fullName}`, filename: selected.documentFilename, mimeType: selected.documentMimeType })}><FileText className="size-4" />Open document</Button>
                    )
                  ) : (
                    <p className="text-sm text-[#9692a3]">No document attached.</p>
                  )}
                </div>
                {selected.hasDocument && (
                  <a href={kycDocumentUrl(selected.id)} download className="inline-block">
                    <Button variant="outline" size="sm" className="rounded-xl"><Paperclip className="size-4" />Download document</Button>
                  </a>
                )}
                {selected.status === "pending" ? <div>
                  <Label htmlFor="kyc-note">Review note (optional)</Label>
                  <Textarea id="kyc-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the record…" className="mt-1 min-h-20 rounded-[14px]" />
                </div> : selected.reviewNote ? <div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3 text-sm text-[#55516b]"><span className="font-semibold">Review note:</span> {selected.reviewNote}</div> : null}

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`rounded-full ${badgeClass(selected.status)}`}>{selected.status}</Badge>
                  {selected.status === "pending" && <div className="ml-auto flex gap-2">
                    <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => decide("reject")}><XCircle className="size-4" />Reject</Button>
                    <Button className="rounded-xl" disabled={busy} onClick={() => decide("approve")}><Check className="size-4" />Approve</Button>
                  </div>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PageIntro({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8179e8]">AccAbad Admin</p><h2 className="mt-2 text-[30px] font-bold tracking-[-.045em] text-[#1b1930]">{title}</h2><p className="mt-1 text-[15px] text-[#7e7a8e]">{description}</p></div>
      {action}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, foot, tone }: { icon: typeof Landmark; label: string; value: string; foot: string; tone: "navy" | "cyan" | "amber" | "violet" }) {
  const tones = {
    navy: "bg-[#eeecff] text-[#6157e7]",
    cyan: "bg-[#e6f8f1] text-[#16815e]",
    amber: "bg-[#fff3df] text-[#b66e10]",
    violet: "bg-[#f1eefe] text-[#7864c9]",
  };
  return <Card className="surface-card rounded-[22px]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#858193]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-.03em] text-[#242139]">{value}</p></div><span className={`grid size-10 place-items-center rounded-[13px] ${tones[tone]}`}><Icon className="size-5" /></span></div><p className="mt-4 text-xs text-[#a09cad]">{foot}</p></CardContent></Card>;
}

function AccountsView({ accounts, clients, cards, accountEmails, onAdd, onOpen, onFundCard, onCreateCard, onEdit, onRevealCredentials, onSync, onDelete }: { accounts: Account[]; clients: Client[]; cards: ClientCard[]; accountEmails: AccountEmail[]; onAdd: () => void; onOpen: (id: string) => void; onFundCard: (cardId?: string, accountId?: string) => void; onCreateCard: (accountId?: string) => void; onEdit: (account: Account) => void; onRevealCredentials: (account: Account) => void; onSync: (account: Account) => void | Promise<void>; onDelete: (id: string) => void }) {
  const paging = usePaginatedItems(accounts, 6);
  const [depositAccount, setDepositAccount] = useState<Account | null>(null);
  const [depositCoins, setDepositCoins] = useState<Array<{ symbol: string; name: string; networks_count: number }>>([]);
  const [depositNetworks, setDepositNetworks] = useState<Array<{ network: string; name: string; min_amount: number }>>([]);
  const [depositCurrency, setDepositCurrency] = useState("");
  const [depositNetwork, setDepositNetwork] = useState("");
  const [depositAmount, setDepositAmount] = useState("100");
  const [deposits, setDeposits] = useState<AccountDeposit[]>([]);
  const [depositBusy, setDepositBusy] = useState(false);
  const openDeposit = async (account: Account) => {
    setDepositAccount(account);
    setDepositBusy(true);
    try {
      const [coinResult, history] = await Promise.all([fetchAccountDepositCoins(account.id), fetchAccountDeposits(account.id)]);
      setDepositCoins(coinResult.coins);
      setDeposits(history.items);
      const currency = coinResult.coins[0]?.symbol ?? "";
      setDepositCurrency(currency);
      if (currency) {
        const result = await fetchAccountDepositNetworks(account.id, currency);
        setDepositNetworks(result.networks);
        setDepositNetwork(result.networks[0]?.network ?? "");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Crypto deposit options could not be loaded.");
    } finally {
      setDepositBusy(false);
    }
  };
  const selectDepositCurrency = async (currency: string) => {
    if (!depositAccount) return;
    setDepositCurrency(currency);
    setDepositNetwork("");
    setDepositBusy(true);
    try {
      const result = await fetchAccountDepositNetworks(depositAccount.id, currency);
      setDepositNetworks(result.networks);
      setDepositNetwork(result.networks[0]?.network ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Crypto networks could not be loaded.");
    } finally {
      setDepositBusy(false);
    }
  };
  const submitDeposit = async () => {
    if (!depositAccount || !depositCurrency || !depositNetwork) return;
    const password = window.prompt("Re-enter your AccAbad admin password to create this crypto payment:");
    if (!password) return;
    const code = window.prompt("Enter your MFA code if MFA is enabled, otherwise leave this empty:") ?? "";
    setDepositBusy(true);
    try {
      await reauthenticateAdmin(password, code.trim() || undefined);
      const created = await createAccountDeposit(depositAccount.id, { amountUsd: Number(depositAmount), currency: depositCurrency, network: depositNetwork });
      setDeposits((current) => [created, ...current]);
      toast.success("Crypto payment address created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Crypto payment could not be created.");
    } finally {
      setDepositBusy(false);
    }
  };
  const refreshDeposit = async (deposit: AccountDeposit) => {
    if (!depositAccount) return;
    setDepositBusy(true);
    try {
      const updated = await refreshAccountDeposit(depositAccount.id, deposit.id);
      setDeposits((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(updated.status === "completed" ? "Deposit confirmed and balance updated." : `Deposit is ${updated.status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deposit status could not be refreshed.");
    } finally {
      setDepositBusy(false);
    }
  };
  return (
    <>
      <PageIntro title="Account connections" description="Credentials, visible account balances, external inboxes, and exclusive client assignments. Production card funding is executed only from accepted funding requests." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onAdd} className="h-11 rounded-[14px] bg-white"><Plus className="size-4" />Add account</Button></div>} />
      <div className="grid gap-4 xl:grid-cols-3">
        {paging.pageItems.map((account, index) => {
          const assignedClient = clients.find((client) => client.accountIds.includes(account.id));
          const accountCards = cards.filter((card) => card.accountId === account.id);
          const unreadEmails = accountEmails.filter((email) => email.accountId === account.id && email.unread).length;
          return (
            <Card key={account.id} className="surface-card group rounded-[24px] transition hover:-translate-y-0.5 hover:border-[#d9d5ef] hover:shadow-[0_18px_42px_rgba(26,24,48,.08)]">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-12 place-items-center rounded-[16px] ${index === 0 ? "bg-[#eeecff] text-[#6157e7]" : index === 1 ? "bg-[#e6f8f1] text-[#16815e]" : "bg-[#fff3df] text-[#b66e10]"}`}><Landmark className="size-5" /></span>
                  <Badge variant="outline" className={`${account.status === "Connected" ? "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]" : "border-[#f4d9aa] bg-[#fff5e4] text-[#a4600c]"} rounded-full px-2.5`}><span className={`mr-1.5 size-1.5 rounded-full ${account.status === "Connected" ? "bg-[#22a77a]" : "bg-[#f2a33a]"}`} />{account.status}</Badge>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-.025em] text-[#2c2940]">{account.name}</h3>
                <div className="mt-2">{assignedClient ? <Badge variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">Assigned to {assignedClient.name}</Badge> : <Badge variant="outline" className="rounded-full border-dashed text-[#858193]">Available to assign</Badge>}</div>
                <div className="mt-5 grid grid-cols-3 gap-2.5"><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">Cards</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{accountCards.length}</p></div><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">Tracked wallet</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{formatOptionalUsd(account.accountBalance)}</p><p className="mt-1 text-[10px] text-[#aaa6b8]">{account.accountBalanceSource === "unavailable" ? "Starts after deposit" : account.accountBalanceSource}</p></div><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">On cards</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{formatUsd(account.cardBalance)}</p></div></div>
                <div className="mt-3 overflow-hidden rounded-[16px] border border-[#e8e5f0] bg-white"><div className="flex items-center justify-between border-b border-[#eeecf3] px-3.5 py-2.5"><p className="text-xs font-semibold uppercase tracking-[.08em] text-[#9692a3]">Cards</p><button onClick={() => onOpen(account.id)} className="text-xs font-semibold text-[#6157e7]">View all</button></div>{accountCards.slice(0, 2).map((card) => <div key={card.id} className="flex items-center gap-3 border-b border-[#f0eef4] px-3.5 py-2.5 last:border-b-0"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eeecff] text-[#6157e7]"><CreditCard className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#353146]">{card.label} · •{card.last4}</p><p className="text-xs text-[#9692a3]">{formatUsd(card.balance)} · {card.frozen ? "Frozen" : "Active"}</p></div><Button size="sm" variant="ghost" className="h-8 rounded-lg px-2.5 text-[#6157e7]" onClick={() => onFundCard(card.id)}><CircleDollarSign className="size-3.5" />Add funds</Button></div>)}{!accountCards.length && <div className="px-3.5 py-4 text-center text-sm text-[#9692a3]">No cards in this account</div>}{accountCards.length > 2 && <button onClick={() => onOpen(account.id)} className="w-full border-t border-[#eeecf3] px-3.5 py-2 text-left text-xs font-medium text-[#777287]">+{accountCards.length - 2} more cards</button>}</div>
                <button onClick={() => onOpen(account.id)} className="mt-3 flex w-full items-center gap-3 rounded-[15px] border border-[#e8e5f0] bg-white p-3 text-left transition hover:border-[#d8d3ff] hover:bg-[#f8f7ff]">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#eeecff] text-[#6157e7]"><Mail className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#353146]">{account.mailbox}</span><span className="mt-0.5 block text-xs text-[#9692a3]">{account.mailProvider} · {account.emailConnectionStatus === "connected" ? "connected" : account.emailConnectionStatus === "reauth_required" ? "reconnect required" : account.emailConnectionStatus === "error" ? "sync error" : "not connected"}</span></span>
                  {unreadEmails > 0 && <Badge className="rounded-full bg-[#6157e7] text-white">{unreadEmails}</Badge>}
                </button>
                <div className="mt-4 rounded-[16px] border border-[#ece9f2] bg-[#faf9fc] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-[#9692a3]"><KeyRound className="size-3.5" />Admin credentials</div>
                  <dl className="mt-3 grid gap-2.5 text-sm">
                    <div className="grid grid-cols-[70px_1fr] gap-2"><dt className="text-[#9692a3]">Email</dt><dd className="truncate font-medium text-[#353146]">{account.owner}</dd></div>
                    <div className="grid grid-cols-[70px_1fr] gap-2"><dt className="text-[#9692a3]">Password</dt><dd className="truncate font-mono text-xs font-semibold text-[#353146]">{account.password}</dd></div>
                    <div className="grid grid-cols-[70px_1fr] gap-2"><dt className="text-[#9692a3]">API key</dt><dd className="font-mono text-xs text-[#777287]">{account.keyHint}</dd></div>
                  </dl>
                </div>
                <Button variant="ghost" className="mt-2 h-9 w-full rounded-[12px] text-[#6157e7]" onClick={() => void onRevealCredentials(account)}><KeyRound className="size-4" />Reveal credentials</Button>
                <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="h-10 rounded-[13px] bg-white" onClick={() => onOpen(account.id)}><Eye className="size-4" />Open account</Button><Button variant="outline" className="h-10 rounded-[13px] bg-white" onClick={() => void openDeposit(account)}><CircleDollarSign className="size-4" />Add crypto</Button><Button variant="outline" className="h-10 rounded-[13px] bg-white" disabled={!accountCards.length} onClick={() => onFundCard(undefined, account.id)}><WalletCards className="size-4" />Fund a card</Button><Button variant="ghost" className="h-10 rounded-[12px] text-[#6157e7]" onClick={() => onCreateCard(account.id)}><Plus className="size-4" />Create card</Button></div>
                <div className="mt-4 flex items-center justify-between border-t border-[#eeecf3] pt-4"><p className="text-xs text-[#aaa6b8]">Synced {account.lastSync}</p><div className="flex gap-1"><Button variant="ghost" size="icon" className="rounded-xl text-[#777287] hover:bg-[#f2f0fa]" onClick={() => void onSync(account)}><RefreshCw className="size-4" /><span className="sr-only">Sync</span></Button><Button variant="ghost" size="icon" className="rounded-xl text-[#777287] hover:bg-[#f2f0fa]" onClick={() => onEdit(account)}><PencilLine className="size-4" /><span className="sr-only">Edit</span></Button><Button variant="ghost" size="icon" className="rounded-xl text-[#c24755] hover:bg-[#fff0f2]" onClick={() => onDelete(account.id)}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button></div></div>
              </CardContent>
            </Card>
          );
        })}
        {!accounts.length && <div className="col-span-full rounded-2xl border border-dashed bg-white p-12 text-center"><Landmark className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-medium">No matching accounts</p><p className="mt-1 text-sm text-slate-500">Try another search or add a new connection.</p></div>}
      </div>
      <div className="mt-4 overflow-hidden rounded-[20px] border border-[#e8e6ef] bg-white"><ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} /></div>
      <Alert className="mt-5 rounded-[20px] border-[#ddd9f5] bg-[#f3f1ff]"><ShieldCheck className="text-[#6157e7]" /><AlertTitle className="text-[#302b68]">Account ownership controls bot access</AlertTitle><AlertDescription className="text-[#625c86]">Cards always remain inside their Kripicard account. Telegram clients only inherit cards from currently assigned accounts; disconnecting the final account immediately returns that client to the Contact admin state.</AlertDescription></Alert>
      <Dialog open={Boolean(depositAccount)} onOpenChange={(open) => { if (!open) setDepositAccount(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Add crypto to {depositAccount?.name}</DialogTitle><DialogDescription>Kripicard creates a one-time payment address. Send the exact asset and network shown below.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>USD amount</Label><Input type="number" min={1} value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></div>
            <div className="grid gap-2"><Label>Asset</Label><Select value={depositCurrency} onValueChange={(value) => void selectDepositCurrency(value)}><SelectTrigger><SelectValue placeholder="Choose asset" /></SelectTrigger><SelectContent>{depositCoins.map((coin) => <SelectItem key={coin.symbol} value={coin.symbol}>{coin.name} ({coin.symbol})</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Network</Label><Select value={depositNetwork} onValueChange={setDepositNetwork}><SelectTrigger><SelectValue placeholder="Choose network" /></SelectTrigger><SelectContent>{depositNetworks.map((network) => <SelectItem key={network.network} value={network.network}>{network.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button disabled={depositBusy || !depositCurrency || !depositNetwork || Number(depositAmount) < 1} onClick={() => void submitDeposit()}><CircleDollarSign className="size-4" />Create crypto payment</Button>
          <div className="space-y-3">{deposits.map((deposit) => <div key={deposit.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{deposit.payAmount} {deposit.currency}</p><p className="text-xs text-[#8f8b9c]">{deposit.network} · {formatUsd(Number(deposit.expectedCreditUsdCents) / 100)} expected credit</p></div><Badge variant="outline">{deposit.status}</Badge></div><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 p-2 text-xs">{deposit.payAddress}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(deposit.payAddress)}>Copy</Button></div><div className="mt-3 flex items-center justify-between"><p className="text-xs text-[#9692a3]">Expires {new Date(deposit.expiresAt).toLocaleString()}</p>{deposit.status === "pending" && <Button size="sm" variant="outline" disabled={depositBusy} onClick={() => void refreshDeposit(deposit)}><RefreshCw className="size-3.5" />Check status</Button>}</div></div>)}{!deposits.length && !depositBusy && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-[#9692a3]">No crypto payments created for this account yet.</p>}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClientsView({ clients, cards, onOpen, onToggleBan, accountName, kycStatusByUser, onNotify }: { clients: Client[]; cards: ClientCard[]; onOpen: (id: string) => void; onToggleBan: (id: string) => void; accountName: (id: string | null) => string; kycStatusByUser: Record<string, "approved" | "pending" | "rejected">; onNotify: (id: string) => void | Promise<void> }) {
  const kycBadge = (telegramId: string) => {
    const status = kycStatusByUser[telegramId];
    if (!status) return <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">KYC —</Badge>;
    const cls = status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700";
    return <Badge variant="outline" className={cls}>KYC {status}</Badge>;
  };
  const paging = usePaginatedItems(clients);
  return (
    <>
      <PageIntro title="Clients" description="Telegram onboarding, KYC, assigned Kripicard accounts, cards, and access." />
      <Card className="data-table overflow-hidden surface-card rounded-[24px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Client</TableHead><TableHead>Connected account</TableHead><TableHead>Cards</TableHead><TableHead>Total funded</TableHead><TableHead>Bot access</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
            <TableBody>
              {paging.pageItems.map((client) => {
                const accessibleCards = cards.filter((card) => client.accountIds.includes(card.accountId));
                return <TableRow key={client.id}>
                  <TableCell className="pl-6"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(client.name)}</AvatarFallback></Avatar><div><button onClick={() => onOpen(client.id)} className="font-semibold text-[#353146] hover:text-[#6157e7]">{client.name}</button> <span className="align-middle">{kycBadge(client.telegramId)}</span><p className="mt-0.5 text-xs text-[#9692a3]">{client.username} · {client.telegramId}</p></div></div></TableCell>
                  <TableCell>{client.accountIds.length ? <div className="flex max-w-[280px] flex-wrap gap-1.5">{client.accountIds.map((id) => <Badge key={id} variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">{accountName(id)}</Badge>)}</div> : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Not assigned yet</Badge>}</TableCell>
                  <TableCell><span className="font-semibold">{accessibleCards.length}</span></TableCell>
                  <TableCell className="font-medium">{formatUsd(client.totalFunded)}</TableCell>
                  <TableCell><Badge variant="outline" className={client.banned ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{client.banned ? "Banned" : "Active"}</Badge></TableCell>
                  <TableCell><div className="flex items-center justify-end gap-3"><Button variant="ghost" size="sm" onClick={() => void onNotify(client.id)}><Bell className="size-4" /><span className="sr-only">Notify {client.name}</span></Button><Button variant="ghost" size="sm" onClick={() => onOpen(client.id)}>View</Button><Switch checked={!client.banned} onCheckedChange={() => onToggleBan(client.id)} aria-label={`${client.banned ? "Unban" : "Ban"} ${client.name}`} /></div></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
        <ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} />
      </Card>
      <div className="mt-4 flex items-center gap-2 rounded-[16px] border border-[#e8e5f6] bg-[#f5f3ff] px-4 py-3 text-sm text-[#6a6488]"><ShieldCheck className="size-4 text-[#6157e7]" />A customer&apos;s first card is created only through the KYC → payment → receipt approval → account assignment → card creation onboarding flow.</div>
    </>
  );
}

function RequestsView({
  fundingRequests,
  cardRequests,
  cardRequestPendingId,
  clientName,
  search,
  onOpenRequest,
  onReviewCardPayment,
  onReviewCardRequest,
  onIssueCardRequest,
  onReconcileCardRequest,
  onAttachCardRequest,
  kycPendingCount,
  clients,
  paymentStatusByUser,
  paymentPipelineByUser,
  onOpenClient,
  onPaymentDecision,
  transactions,
  issues,
  onReconcileIssue,
}: {
  fundingRequests: FundingRequest[];
  cardRequests: ApiCardRequest[];
  cardRequestPendingId: string | null;
  clientName: (id: string | null) => string;
  search: string;
  onOpenRequest: (id: string) => void;
  onReviewCardPayment: (request: ApiCardRequest, action: "accept" | "correction" | "reject") => void | Promise<void>;
  onReviewCardRequest: (request: ApiCardRequest, action: "approve" | "reject", accountId?: string, bin?: string) => void | Promise<void>;
  onIssueCardRequest: (request: ApiCardRequest) => void | Promise<void>;
  onReconcileCardRequest: (request: ApiCardRequest) => void | Promise<void>;
  onAttachCardRequest: (request: ApiCardRequest, cardId: string) => void | Promise<void>;
  kycPendingCount: number;
  clients: Client[];
  paymentStatusByUser: Record<string, string | null>;
  paymentPipelineByUser: Record<string, ClientPipelineItem>;
  onOpenClient: (id: string) => void;
  onPaymentDecision: (clientId: string, action: "accept" | "deny") => void | Promise<void>;
  transactions: Transaction[];
  issues: TransactionNotificationIssue[];
  onReconcileIssue: (id: string, action: "acknowledge" | "retry") => void | Promise<void>;
}) {
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [cardChoices, setCardChoices] = useState<Record<string, { accountId: string; bin: string }>>({});
  const [attachLoadingId, setAttachLoadingId] = useState<string | null>(null);
  const [attachExisting, setAttachExisting] = useState<{ request: ApiCardRequest; cards: ApiCard[]; cardId: string } | null>(null);
  const needle = search.trim().toLowerCase();
  const matchingFundingRequests = fundingRequests.filter((request) => !needle || `${request.id} ${clientName(request.clientId)} ${request.cardLast4} ${request.receipt} ${request.receiptType} ${fundingMeta[request.status].label}`.toLowerCase().includes(needle));
  const matchingCardRequests = cardRequests.filter((request) => !needle || `${request.reference} ${request.client.displayName ?? ""} ${request.client.username ?? ""} ${request.email} ${request.status}`.toLowerCase().includes(needle));
  const onboardingClients = clients.filter((client) => {
    const status = paymentStatusByUser[client.id];
    return status && status !== "complete" && status !== "denied" && (!needle || `${client.name} ${client.username} ${client.telegramId} ${status}`.toLowerCase().includes(needle));
  });
  const fundingPaging = usePaginatedItems(matchingFundingRequests);
  const cardPaging = usePaginatedItems(matchingCardRequests);
  const onboardingPaging = usePaginatedItems(onboardingClients);
  const openCardCount = cardRequests.filter((item) => !["issued", "rejected", "cancelled"].includes(item.status)).length;
  const defaultTab = openCardCount ? "cards" : matchingFundingRequests.length ? "funding" : onboardingClients.length ? "onboarding" : kycPendingCount ? "kyc" : "cards";

  const cardChoice = (request: ApiCardRequest) => cardChoices[request.id] ?? {
    accountId: request.selectedAccountId ?? request.eligibleAccounts.find((account) => account.selected)?.id ?? "",
    bin: request.status === "pending_review" || request.status === "correction_needed"
      ? request.availableBins[0]?.bin ?? ""
      : request.bin,
  };

  const openExistingCardAttach = async (request: ApiCardRequest) => {
    if (!request.selectedAccountId) {
      toast.error("Approve the request with an internal account before attaching an existing card.");
      return;
    }
    setAttachLoadingId(request.id);
    try {
      await syncAccountCards(request.selectedAccountId);
      const result = await fetchAccountCards(request.selectedAccountId);
      const available = result.items.filter((card) => !["closed", "expired"].includes(card.status));
      if (!available.length) {
        toast.info("No active synchronized cards were found in the selected account.");
        return;
      }
      setAttachExisting({ request, cards: available, cardId: available[0]!.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not synchronize existing cards.");
    } finally {
      setAttachLoadingId(null);
    }
  };

  return (
    <>
      <PageIntro title="Request center" description="Review new-card requests, existing-card funding, first-card onboarding, KYC, and transaction notification issues." />
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-4 h-11 rounded-[14px] border border-[#e7e5ef] bg-white p-1 shadow-[0_4px_18px_rgba(26,24,48,.04)]">
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="cards">New cards <Badge className="ml-1.5 rounded-full bg-[#6157e7] text-white">{openCardCount}</Badge></TabsTrigger>
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="funding">Funding <Badge className="ml-1.5 rounded-full bg-[#6157e7] text-white">{fundingRequests.filter((item) => !["completed", "rejected", "cancelled"].includes(item.status)).length}</Badge></TabsTrigger>
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="onboarding">First cards <Badge className="ml-1.5 rounded-full bg-[#6157e7] text-white">{onboardingClients.length}</Badge></TabsTrigger>
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="kyc">KYC <Badge className="ml-1.5 rounded-full bg-[#6157e7] text-white">{kycPendingCount}</Badge></TabsTrigger>
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="transactions">Transactions <Badge variant="outline" className="ml-1.5 rounded-full">{transactions.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="cards">
          <Card className="data-table overflow-hidden surface-card rounded-[24px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#faf9fc]">
                    <TableHead className="pl-6">Request</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Internal account</TableHead>
                    <TableHead>BIN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardPaging.pageItems.map((request) => {
                    const choice = cardChoice(request);
                    const reviewable = ["pending_review", "correction_needed"].includes(request.status);
                    const adminDirect = request.origin === "admin_direct";
                    const paymentVerified = adminDirect || request.payment?.status === "accepted" || request.payment?.status === "completed";
                    const paymentPendingReview = !adminDirect && request.payment?.status === "pending_review";
                    const busy = cardRequestPendingId === request.id;
                    return <TableRow key={request.id}>
                      <TableCell className="pl-6"><span className="font-semibold text-[#353146]">{request.reference}</span>{adminDirect && <Badge variant="outline" className="ml-2 border-violet-200 bg-violet-50 text-violet-700">admin direct</Badge>}<span className="mt-0.5 block text-xs text-[#9692a3]">{new Date(request.createdAt).toLocaleString()}</span></TableCell>
                      <TableCell><span className="font-semibold">{request.client.displayName ?? request.client.username ?? request.client.telegramUserId}</span><span className="block text-xs text-[#9d99aa]">{request.client.username ? `@${request.client.username.replace(/^@/, "")}` : request.client.telegramUserId}</span></TableCell>
                      <TableCell>
                        <span className="font-semibold">{formatUsd(Number(request.initialAmountUsdCents) / 100)}</span>
                        <span className="block text-xs text-[#9d99aa]">{request.email}</span>
                        {adminDirect ? <Badge variant="outline" className="mt-1.5 border-violet-200 bg-violet-50 text-violet-700">No customer payment required</Badge> : request.payment ? <div className="mt-1.5 space-y-1 text-xs">
                          <div><Badge variant="outline" className={request.payment.status === "accepted" || request.payment.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : request.payment.status === "pending_review" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}>{request.payment.status.replaceAll("_", " ")}</Badge></div>
                          <div className="text-[#777287]">{BigInt(request.payment.customerPaysRial).toLocaleString("en-US")} IRR · {BigInt(request.payment.rateRialPerUsd).toLocaleString("en-US")} IRR/USD</div>
                          {request.payment.receiptId && <button type="button" onClick={() => openAdminAttachment({ url: customerPaymentReceiptUrl(request.payment!.id), title: `Payment receipt · ${request.reference}`, filename: `${request.payment!.reference}-receipt` })} className="inline-flex items-center gap-1 font-semibold text-[#6157e7] hover:underline"><ReceiptText className="size-3.5" />View receipt</button>}
                        </div> : <Badge variant="outline" className="mt-1.5 border-red-200 bg-red-50 text-red-700">Payment missing</Badge>}
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={!reviewable || !paymentVerified || busy}
                          value={choice.accountId}
                          onValueChange={(accountId) => setCardChoices((current) => ({ ...current, [request.id]: { ...choice, accountId } }))}
                        >
                          <SelectTrigger className="min-w-48"><SelectValue placeholder="Choose account" /></SelectTrigger>
                          <SelectContent>
                            {request.eligibleAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label}{account.selected ? " · current" : " · free"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={!reviewable || !paymentVerified || busy}
                          value={choice.bin}
                          onValueChange={(bin) => setCardChoices((current) => ({ ...current, [request.id]: { ...choice, bin } }))}
                        >
                          <SelectTrigger className="min-w-36"><SelectValue placeholder="Choose BIN" /></SelectTrigger>
                          <SelectContent>
                            {request.availableBins.map((item) => <SelectItem key={item.bin} value={item.bin}>{item.bin}{item.requiresDob ? " · DOB" : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="rounded-full">{request.status.replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {paymentPendingReview && <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onReviewCardPayment(request, "correction")}>New receipt</Button>
                            <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={busy} onClick={() => void onReviewCardPayment(request, "reject")}>Reject payment</Button>
                            <Button size="sm" disabled={busy} onClick={() => void onReviewCardPayment(request, "accept")}>Accept payment</Button>
                          </>}
                          {reviewable && paymentVerified && <>
                            <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={busy} onClick={() => void onReviewCardRequest(request, "reject")}>Reject request</Button>
                            <Button size="sm" disabled={busy || !choice.accountId || !choice.bin} onClick={() => void onReviewCardRequest(request, "approve", choice.accountId, choice.bin)}>Approve card</Button>
                          </>}
                          {["approved", "issue_failed"].includes(request.status) && <Button size="sm" disabled={busy} onClick={() => void onIssueCardRequest(request)}>Issue card</Button>}
                          {["approved", "issuing", "issue_failed", "needs_reconciliation"].includes(request.status) && <Button size="sm" variant="outline" disabled={busy || attachLoadingId === request.id} onClick={() => void openExistingCardAttach(request)}><Link2 className="size-3.5" />Attach existing</Button>}
                          {request.status === "needs_reconciliation" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void onReconcileCardRequest(request)}><RefreshCw className="size-3.5" />Reconcile</Button>}
                          {request.status === "issuing" && <Button size="sm" disabled>Issuing…</Button>}
                          {request.status === "issued" && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Issued</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
            {matchingCardRequests.length === 0 && <div className="border-t p-8 text-center text-sm text-[#9692a3]">No additional-card requests match this view.</div>}
            <ListPagination page={cardPaging.page} pageSize={cardPaging.pageSize} totalItems={cardPaging.totalItems} totalPages={cardPaging.totalPages} onPageChange={cardPaging.setPage} />
          </Card>
        </TabsContent>

        <TabsContent value="funding">
          <Card className="data-table overflow-hidden surface-card rounded-[24px]">
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Request</TableHead><TableHead>Client</TableHead><TableHead>Card</TableHead><TableHead>Receipt</TableHead><TableHead>Client pays</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{fundingPaging.pageItems.map((request) => <TableRow key={request.id} className="cursor-pointer" onClick={() => onOpenRequest(request.id)}><TableCell className="pl-6 font-semibold text-[#353146]">{request.id}<span className="mt-0.5 block text-xs font-normal text-[#9692a3]">{request.submitted}</span></TableCell><TableCell>{clientName(request.clientId)}</TableCell><TableCell><span className="font-semibold">{formatUsd(request.amount)}</span><span className="block text-xs text-[#9d99aa]">to •{request.cardLast4}</span></TableCell><TableCell><span className="inline-flex items-center gap-2 text-sm"><ReceiptIcon type={request.receiptType} />{request.receiptType.toUpperCase()}</span></TableCell><TableCell className="font-medium">{formatRial(request.rialTotal)}</TableCell><TableCell><StatusBadge status={request.status} /></TableCell><TableCell><span className="grid size-8 place-items-center rounded-lg bg-[#f4f2fa]"><ChevronRight className="size-4 text-[#777287]" /></span></TableCell></TableRow>)}</TableBody></Table></div>
            {matchingFundingRequests.length === 0 && <div className="border-t p-8 text-center text-sm text-[#9692a3]">No existing-card funding requests. First-card payments appear in the First cards tab.</div>}
            <ListPagination page={fundingPaging.page} pageSize={fundingPaging.pageSize} totalItems={fundingPaging.totalItems} totalPages={fundingPaging.totalPages} onPageChange={fundingPaging.setPage} />
          </Card>
        </TabsContent>

        <TabsContent value="onboarding">
          <Card className="data-table overflow-hidden surface-card rounded-[24px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Client</TableHead><TableHead>Amount</TableHead><TableHead>Receipt</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{onboardingPaging.pageItems.map((client) => {
                  const pipeline = paymentPipelineByUser[client.id];
                  const status = pipeline?.status ?? paymentStatusByUser[client.id] ?? "waiting";
                  const pending = status === "pending";
                  return <TableRow key={client.id} className="cursor-pointer" onClick={() => onOpenClient(client.id)}>
                    <TableCell className="pl-6"><span className="font-semibold text-[#353146]">{client.name}</span><span className="block text-xs text-[#9d99aa]">{client.username} · {client.telegramId}</span></TableCell>
                    <TableCell>
                      <span className="font-semibold">{pipeline?.amountUsdCents ? formatUsd(Number(pipeline.amountUsdCents) / 100) : "—"}</span>
                      {pipeline?.customerPaysRial && <span className="block text-xs text-[#777287]">{BigInt(pipeline.customerPaysRial).toLocaleString("en-US")} IRR</span>}
                      {pipeline?.rateRialPerUsd && <span className="block text-xs text-[#9d99aa]">@ {BigInt(pipeline.rateRialPerUsd).toLocaleString("en-US")} IRR/USD</span>}
                    </TableCell>
                    <TableCell>{pipeline?.hasReceipt ? <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-[#6157e7] hover:underline" onClick={(event) => { event.stopPropagation(); openAdminAttachment({ url: clientReceiptUrl(client.id), title: `First-card receipt · ${client.name}`, filename: `${pipeline.paymentReference ?? client.id}-receipt`, mimeType: pipeline.receiptMime }); }}><ReceiptText className="size-4" />View receipt</button> : <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Missing</Badge>}</TableCell>
                    <TableCell>{pipeline?.receiptAt ? new Date(pipeline.receiptAt).toLocaleString() : client.joined}</TableCell>
                    <TableCell><Badge variant="outline" className={pending ? "border-amber-200 bg-amber-50 text-amber-800" : status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}>{status.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell><div className="flex justify-end gap-2">{pending ? <><Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={paymentActionId === client.id} onClick={(event) => { event.stopPropagation(); setPaymentActionId(client.id); void Promise.resolve(onPaymentDecision(client.id, "deny")).finally(() => setPaymentActionId(null)); }}>Deny</Button><Button size="sm" disabled={paymentActionId === client.id || !pipeline?.hasReceipt} onClick={(event) => { event.stopPropagation(); setPaymentActionId(client.id); void Promise.resolve(onPaymentDecision(client.id, "accept")).finally(() => setPaymentActionId(null)); }}>Accept</Button></> : <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); onOpenClient(client.id); }}>Open</Button>}</div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
            {onboardingClients.length === 0 && <div className="border-t p-8 text-center text-sm text-[#9692a3]">No first-card requests are waiting for admin action.</div>}
            <ListPagination page={onboardingPaging.page} pageSize={onboardingPaging.pageSize} totalItems={onboardingPaging.totalItems} totalPages={onboardingPaging.totalPages} onPageChange={onboardingPaging.setPage} />
          </Card>
        </TabsContent>
        <TabsContent value="kyc"><KycView /></TabsContent>
        <TabsContent value="transactions"><TransactionsView transactions={transactions} clientName={clientName} search={search} issues={issues} onReconcileIssue={onReconcileIssue} /></TabsContent>
      </Tabs>
      <Dialog open={Boolean(attachExisting)} onOpenChange={(open) => { if (!open) setAttachExisting(null); }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Attach an existing card</DialogTitle>
            <DialogDescription>Use this only when the card was already created directly in Kripicard. This marks the request issued without another create-card call.</DialogDescription>
          </DialogHeader>
          {attachExisting && <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <p className="font-semibold">{attachExisting.request.reference}</p>
              <p className="text-xs text-[#777287]">{attachExisting.request.client.displayName ?? attachExisting.request.client.telegramUserId}</p>
            </div>
            <div className="grid gap-2">
              <Label>Synced card</Label>
              <Select value={attachExisting.cardId} onValueChange={(cardId) => setAttachExisting((current) => current ? { ...current, cardId } : current)}>
                <SelectTrigger><SelectValue placeholder="Choose card" /></SelectTrigger>
                <SelectContent>
                  {attachExisting.cards.map((card) => <SelectItem key={card.id} value={card.id}>•{card.last4 ?? "????"} · {card.cardholderName ?? "Unnamed"} · {card.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachExisting(null)}>Cancel</Button>
            <Button disabled={!attachExisting?.cardId || cardRequestPendingId === attachExisting?.request.id} onClick={() => {
              if (!attachExisting) return;
              const current = attachExisting;
              void Promise.resolve(onAttachCardRequest(current.request, current.cardId)).then(() => setAttachExisting(null));
            }}><Check className="size-4" />Attach & complete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TransactionsView({ transactions, clientName, search, issues, onReconcileIssue }: { transactions: Transaction[]; clientName: (id: string | null) => string; search: string; issues: TransactionNotificationIssue[]; onReconcileIssue: (id: string, action: "acknowledge" | "retry") => void | Promise<void> }) {
  const needle = search.trim().toLowerCase();
  const matchingTransactions = transactions.filter((transaction) => !needle || `${transaction.id} ${clientName(transaction.clientId)} ${transaction.accountId} ${transaction.cardLast4} ${transaction.merchant} ${transaction.type} ${transaction.status}`.toLowerCase().includes(needle));
  const paging = usePaginatedItems(matchingTransactions);
  const successfulVolume = matchingTransactions.filter((transaction) => transaction.status === "Success").reduce((total, transaction) => total + transaction.amount, 0);
  const declinedVolume = matchingTransactions.filter((transaction) => transaction.status !== "Success").reduce((total, transaction) => total + transaction.amount, 0);
  const verificationEvents = matchingTransactions.filter((transaction) => transaction.type.toLowerCase().includes("verification")).length;
  return (
    <>
      <PageIntro title="Card transactions" description="Scheduled Kripicard activity with fingerprint deduplication and current-owner Telegram notifications." action={<Button variant="outline" className="h-11 rounded-[14px] border-[#dedbe8] bg-white" onClick={() => toast.info("Scheduled sync runs through the protected Kripicard transaction job. Manual per-card sync remains available from card details.")}><RefreshCw className="size-4" />Sync status</Button>} />
      {issues.length > 0 && <Card className="mb-4 surface-card rounded-[22px] border-amber-200 bg-amber-50/40"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Notification reconciliation</CardTitle><p className="mt-1 text-sm text-[#777287]">Failed deliveries can be safely retried only while the original user still owns the account. Ownership-change skips are never resent automatically.</p></div><Badge variant="outline" className="rounded-full border-amber-300 bg-white text-amber-800">{issues.length} issue{issues.length === 1 ? "" : "s"}</Badge></div></CardHeader><CardContent className="space-y-2">{issues.slice(0, 8).map((issue) => <div key={issue.id} className="flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">•{issue.last4 ?? "????"} · {issue.merchant || issue.transactionType || "Provider transaction"}</p><p className="mt-1 text-xs text-[#8f8b9c]">{issue.notificationStatus} · {issue.notificationError || "delivery mismatch"} · {new Date(issue.occurredAt).toLocaleString()}</p></div><div className="flex gap-2">{issue.notificationStatus === "failed" && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void onReconcileIssue(issue.id, "retry")}>Retry safely</Button>}<Button size="sm" variant="outline" className="rounded-xl" onClick={() => void onReconcileIssue(issue.id, "acknowledge")}>Acknowledge</Button></div></div>)}</CardContent></Card>}
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><MetricCard icon={CheckCircle2} label="Successful volume" value={formatUsd(successfulVolume)} foot="From matching stored transactions" tone="cyan" /><MetricCard icon={XCircle} label="Declined volume" value={formatUsd(declinedVolume)} foot="From matching stored transactions" tone="amber" /><MetricCard icon={ShieldCheck} label="Verification events" value={String(verificationEvents)} foot="No OTP code exposed" tone="violet" /></div>
      <Card className="data-table overflow-hidden surface-card rounded-[24px]"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Transaction</TableHead><TableHead>Client</TableHead><TableHead>Merchant</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Telegram</TableHead></TableRow></TableHeader><TableBody>{paging.pageItems.map((tx) => <TableRow key={tx.id}><TableCell className="pl-6"><span className="font-semibold text-[#353146]">{tx.id}</span><span className="mt-0.5 block text-xs text-[#9692a3]">{tx.date}</span></TableCell><TableCell>{clientName(tx.clientId)}<span className="block text-xs text-[#9d99aa]">card •{tx.cardLast4}</span></TableCell><TableCell className="font-semibold text-[#353146]">{tx.merchant}</TableCell><TableCell>{tx.type}</TableCell><TableCell className="font-semibold text-[#353146]">{formatUsd(tx.amount)}</TableCell><TableCell><Badge variant="outline" className={`${tx.status === "Success" ? "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]" : "border-[#f1c7cc] bg-[#fff0f2] text-[#b53847]"} rounded-full`}>{tx.status}</Badge></TableCell><TableCell><Badge variant="outline" className="rounded-full">{tx.notificationStatus ?? "unknown"}</Badge></TableCell></TableRow>)}</TableBody></Table></div><ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} /></Card>
    </>
  );
}

function InboxView({ clients, activeClient, activeClientId, messages, draft, search, conversations, attachment, onAttachment, onDraftChange, onSelect, onSend, onConversationAction, onRetry, hasMore, onLoadOlder }: { clients: Client[]; activeClient: Client; activeClientId: string; messages: Message[]; draft: string; search: string; conversations: SupportConversationSummary[]; attachment: File | null; onAttachment: (file: File | null) => void; onDraftChange: (value: string) => void; onSelect: (id: string) => void; onSend: () => void; onConversationAction: (action: "open" | "pending" | "closed" | "assign_me") => void | Promise<void>; onRetry: (messageId: string) => void | Promise<void>; hasMore: boolean; onLoadOlder: () => void }) {
  const needle = search.trim().toLowerCase();
  const summaryByUser = new Map(conversations.map((item) => [item.userId, item]));
  const matchingClients = clients.filter((client) => {
    const summary = summaryByUser.get(client.id);
    const preview = summary?.lastMessage?.text ?? "";
    return !needle || `${client.name} ${client.username} ${client.telegramId} ${preview}`.toLowerCase().includes(needle);
  }).sort((a, b) => (summaryByUser.get(b.id)?.unreadAdminCount ?? 0) - (summaryByUser.get(a.id)?.unreadAdminCount ?? 0));
  const paging = usePaginatedItems(matchingClients);
  const activeConversation = summaryByUser.get(activeClientId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const lastMsgIdRef = useRef<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollToBottom = () => { const el = containerRef.current; if (el) el.scrollTop = el.scrollHeight; };
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    lastMsgIdRef.current = null;
  }, [activeClientId]);
  useEffect(() => {
    const last = messages[messages.length - 1]?.id ?? null;
    if (last !== lastMsgIdRef.current) {
      lastMsgIdRef.current = last;
      if (!loadingOlderRef.current) scrollToBottom();
    }
  }, [messages]);
  useLayoutEffect(() => {
    if (loadingOlderRef.current) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      loadingOlderRef.current = false;
    }
  }, [messages]);
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    if (el.scrollTop <= 8 && hasMore && !loadingOlderRef.current) {
      loadingOlderRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadOlder();
    }
  };
  if (!activeClient) {
    return (
      <>
        <PageIntro title="Telegram inbox" description="Persistent support conversations with private attachments, unread state, delivery tracking, and durable Telegram retries." />
        <Card className="surface-card rounded-[26px]">
          <CardContent className="p-12 text-center">
            <MessagesSquare className="mx-auto size-8 text-[#c9c5d6]" />
            <p className="mt-3 text-sm font-medium text-[#777287]">No support conversations yet</p>
            <p className="mt-1 text-xs text-[#9692a3]">When Telegram users message your bot, their conversations will appear here.</p>
          </CardContent>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageIntro title="Telegram inbox" description="Persistent support conversations with private attachments, unread state, delivery tracking, and durable Telegram retries." />
      <Card className="grid h-[calc(100dvh-11rem)] min-h-[30rem] overflow-hidden surface-card rounded-[26px] lg:grid-cols-[320px_1fr]">
        <aside className="flex h-full min-h-0 flex-col border-b border-[#e9e7f0] bg-[#f8f7fb] lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-[#e9e7f0] p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#9692a3]">Conversations</p><p className="mt-1 text-sm text-[#777287]">Unread conversations are prioritized automatically.</p></div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5">{paging.pageItems.map((client) => { const summary = summaryByUser.get(client.id); const preview = summary?.lastMessage?.text || ""; return <button key={client.id} onClick={() => onSelect(client.id)} className={`flex w-full items-center gap-3 rounded-[16px] p-3 text-left transition ${activeClientId === client.id ? "bg-white shadow-[0_6px_20px_rgba(26,24,48,.06)] ring-1 ring-[#e2dff1]" : "hover:bg-white/70"}`}><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(client.name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center justify-between"><span className="font-semibold text-[#353146]">{client.name}</span><span className="text-xs text-[#aaa6b8]">{summary?.lastMessageAt ? new Date(summary.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></span><span className="mt-0.5 block truncate text-sm text-[#8c8899]">{preview}</span></span>{Boolean(summary?.unreadAdminCount) && <span className="min-w-5 rounded-full bg-[#6157e7] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{summary?.unreadAdminCount}</span>}</button>; })}</div>
          <ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} />
        </aside>
        <section className="relative flex h-full min-h-0 min-w-0 flex-col bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceaf2] px-5 py-4"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(activeClient.name)}</AvatarFallback></Avatar><div><p className="font-semibold text-[#353146]">{activeClient.name}</p><p className="text-xs text-[#9692a3]">{activeClient.username} · {activeConversation?.status ?? "no conversation"}{activeConversation?.assignedAdminName ? ` · ${activeConversation.assignedAdminName}` : ""}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction("assign_me")}>Assign to me</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction("pending")}>Pending</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction(activeConversation?.status === "closed" ? "open" : "closed")}>{activeConversation?.status === "closed" ? "Reopen" : "Close"}</Button></div></div>
          <div ref={containerRef} onScroll={handleScroll} className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,rgba(97,87,231,.06),transparent_18rem),linear-gradient(180deg,#fff_0%,#faf9fc_100%)] p-5">
            <div className="mt-auto" />
            {messages.map((message, i) => (<Fragment key={message.id}>{(i === 0 || message.day !== messages[i - 1]?.day) && (<div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#b3aec6]">{message.day ? new Date(message.day + "T00:00:00").toLocaleDateString([], { month: "long", day: "numeric" }) : ""}</div>)
}<div className={`max-w-[82%] ${message.from === "admin" ? "ml-auto" : "mr-auto"}`}><div className={`rounded-[18px] px-4 py-3 text-sm leading-6 ${message.from === "admin" ? "rounded-br-md bg-[#6157e7] text-white shadow-[0_8px_20px_rgba(97,87,231,.16)]" : "rounded-bl-md border border-[#e9e6f0] bg-white text-[#464254] shadow-sm"}`}>{message.body && <p>{message.body}</p>}{message.attachment && <button type="button" disabled={!message.attachment.downloadUrl} onClick={() => message.attachment?.downloadUrl && openAdminAttachment({ url: message.attachment.downloadUrl, title: `Support attachment · ${message.attachment.filename}`, filename: message.attachment.filename, mimeType: message.attachment.mimeType })} className="mt-2 flex items-center gap-2 rounded-lg bg-white/10 p-2 text-xs underline-offset-2 hover:underline disabled:opacity-60"><Paperclip className="size-3.5" />{message.attachment.filename}</button>}</div><div className={`mt-1 flex items-center gap-2 text-xs text-[#aaa6b8] ${message.from === "admin" ? "justify-end" : ""}`}><span>{message.time}</span>{message.from === "admin" && <span className="text-[10px] text-[#d6d1ee]">{message.status === "delivered" ? "✓✓" : "✓"}</span>}{message.from === "admin" && message.status && <span>· {message.status}</span>}{message.status === "failed" && <button className="font-semibold text-[#b53847] underline" onClick={() => void onRetry(message.id)}>Retry</button>}</div>{message.lastDeliveryError && <p className="mt-1 text-right text-[11px] text-[#b53847]">{message.lastDeliveryError}</p>}</div></Fragment>))}
          </div>
          {!atBottom && (
            <button onClick={scrollToBottom} aria-label="Scroll to latest" className="absolute right-5 bottom-32 grid size-10 place-items-center rounded-full bg-[#6157e7] text-white shadow-[0_8px_24px_rgba(97,87,231,.4)] transition hover:bg-[#554bcf]">↓</button>
          )}
          <div className="shrink-0 border-t border-[#eceaf2] p-4"><div className="flex items-end gap-2"><label className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[#777287] hover:bg-[#f2f0f8]"><Paperclip className="size-4" /><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onAttachment(event.target.files?.[0] ?? null)} /><span className="sr-only">Attach PDF or image</span></label><Textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Write a message…" className="min-h-11 resize-none rounded-[14px] border-[#e3e0eb]" /><Button size="icon" className="size-11 shrink-0 rounded-[14px] bg-[#6157e7] text-white shadow-[0_8px_18px_rgba(97,87,231,.18)] hover:bg-[#554bcf]" onClick={onSend}><Send className="size-4" /><span className="sr-only">Send</span></Button></div>{attachment && <div className="mt-2 flex items-center justify-between rounded-xl border bg-[#faf9fc] px-3 py-2 text-xs"><span className="truncate"><Paperclip className="mr-1 inline size-3.5" />{attachment.name}</span><button className="font-semibold text-[#b53847]" onClick={() => onAttachment(null)}>Remove</button></div>}<p className="mt-2 text-center text-xs text-[#aaa6b8]">PDF/JPEG/PNG/WebP attachments are private and validated for allowed type and structure. Malware scanning is also applied when a scanner is configured.</p></div>
        </section>
      </Card>
    </>
  );
}


function ProviderReadinessPanel() {
  const [snapshot, setSnapshot] = useState<ProviderReadinessSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try { setSnapshot(await fetchProviderReadiness()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load provider readiness."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let cancelled = false;
    fetchProviderReadiness()
      .then((result) => { if (!cancelled) setSnapshot(result); })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load provider readiness."); });
    return () => { cancelled = true; };
  }, []);
  const edit = async (check: ProviderReadinessSnapshot["checks"][number]) => {
    const status = window.prompt("Status: confirmed, partial, unresolved, or not_applicable", check.status);
    if (!status) return;
    if (!["confirmed", "partial", "unresolved", "not_applicable"].includes(status)) { toast.error("Invalid readiness status."); return; }
    const sourceKind = window.prompt("Source: provider_written, live_test, official_public, or none", check.sourceKind === "supplied_pdf" ? "none" : check.sourceKind);
    if (!sourceKind) return;
    if (!["provider_written", "live_test", "official_public", "none"].includes(sourceKind)) { toast.error("Invalid source kind."); return; }
    const sourceReference = window.prompt("Source reference (ticket/email/test reference, optional)", check.sourceReference ?? "") ?? "";
    const note = window.prompt("Internal note (optional)", check.note ?? "") ?? "";
    setLoading(true);
    try {
      await updateProviderReadinessCheck(check.key, {
        status: status as "confirmed" | "partial" | "unresolved" | "not_applicable",
        sourceKind: sourceKind as "provider_written" | "live_test" | "official_public" | "none",
        sourceReference: sourceReference.trim() || null,
        note: note.trim() || null,
      });
      setSnapshot(await fetchProviderReadiness());
      toast.success("Provider readiness check updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update provider readiness."); }
    finally { setLoading(false); }
  };
  const operations = [
    ["Create card", snapshot?.readyByOperation?.card_create],
    ["Fund card", snapshot?.readyByOperation?.card_fund],
    ["Crypto deposit", snapshot?.readyByOperation?.deposit_create],
  ] as const;
  return <Card className="rounded-2xl">
    <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Kripicard</CardTitle><p className="mt-1 text-sm text-[#9692a3]">Cards spend the provider wallet. Crypto deposits refill that wallet.</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void reload()} className="rounded-xl"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">{operations.map(([label, operation]) => <div key={label} className={`rounded-xl border p-3 ${operation?.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-sm font-semibold">{label}</p><p className={`mt-1 text-xs ${operation?.ready ? "text-emerald-700" : "text-amber-800"}`}>{operation?.ready ? "Ready" : operation ? `Blocked: ${operation.blockers.join(", ")}` : "Checking…"}</p></div>)}</div>
      <details className="group rounded-xl border"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold">Contract checks <span className="flex items-center gap-2 text-xs font-normal text-[#9692a3]">{snapshot ? `${snapshot.summary.confirmed}/${snapshot.summary.total} confirmed` : "Loading…"}<ChevronRight className="size-4 transition group-open:rotate-90" /></span></summary><div className="divide-y border-t">{snapshot?.checks.map((check) => { const cleared = check.status === "confirmed" || check.status === "not_applicable"; return <div key={check.key} className="flex items-start gap-3 p-3"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${cleared ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{cleared ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{check.label}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{check.requirement}</p>{check.note && <p className="mt-1 text-xs text-slate-500">{check.note}</p>}</div><div className="flex shrink-0 items-center gap-2"><Badge variant="outline" className={cleared ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{check.status.replace("_", " ")}</Badge>{check.sourceKind !== "supplied_pdf" && <Button size="sm" variant="outline" disabled={loading} onClick={() => void edit(check)}>Edit</Button>}</div></div>; }) ?? <p className="p-3 text-sm text-slate-500">Provider readiness data is unavailable.</p>}</div></details>
    </CardContent>
  </Card>;
}

function OperationsView({ snapshot, onAlertAction, onControlAction }: { snapshot: OperationalSnapshot | null; onAlertAction: (id: string, action: "acknowledge" | "resolve") => void | Promise<void>; onControlAction: (key: OperationalSnapshot["controls"][number]["key"], enabled: boolean) => void | Promise<void> }) {
  if (!snapshot) return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#9692a3]">Loading operational health…</div>;
  const statusClass = snapshot.status === "critical" ? "border-red-200 bg-red-50 text-red-700" : snapshot.status === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const unhealthyControls = snapshot.controls.filter((control) => control.key === "read_only_mode" ? control.effectiveEnabled : !control.effectiveEnabled);
  const unhealthyJobs = snapshot.jobs.filter((job) => job.status !== "healthy");
  const metrics = [
    ["Provider failures", snapshot.metrics.providerFailures], ["Provider timeouts", snapshot.metrics.providerTimeouts], ["Provider sync lag", snapshot.metrics.providerSyncLag],
    ["Email failures", snapshot.metrics.emailFailures], ["Email sync lag", snapshot.metrics.emailSyncLag], ["Telegram failures", snapshot.metrics.telegramDeliveryFailures],
    ["Webhook backlog", snapshot.metrics.webhookBacklog], ["OTP failures (24h)", snapshot.metrics.otpFailures24h], ["Stuck operations", snapshot.metrics.stuckOperations],
    ["Needs reconciliation", snapshot.metrics.reconciliationOperations], ["Secret reveals (15m)", snapshot.metrics.secretReveals15m],
  ] as const;
  const attentionCount = snapshot.alerts.length + unhealthyControls.length + unhealthyJobs.length;
  return <div className="space-y-5">
    <PageIntro title="Operations" description={`Current system health · updated ${new Date(snapshot.generatedAt).toLocaleString()}.`} />
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs text-[#9692a3]">System</p><Badge variant="outline" className={`mt-2 ${statusClass}`}>{snapshot.status}</Badge></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs text-[#9692a3]">Needs attention</p><p className="mt-1 text-2xl font-semibold">{attentionCount}</p></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-xs text-[#9692a3]">Database response</p><p className="mt-1 text-2xl font-semibold">{snapshot.database.latencyMs} ms</p></CardContent></Card>
    </div>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Needs attention</CardTitle><p className="text-sm text-[#9692a3]">Only current problems and actions are shown here.</p></CardHeader><CardContent className="space-y-3">
      {attentionCount === 0 && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="size-4" />Everything is operating normally.</div>}
      {snapshot.alerts.map((alert) => <div key={alert.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><Badge variant="outline" className={alert.severity === "critical" ? "border-red-200 text-red-700" : "border-amber-200 text-amber-700"}>{alert.severity}</Badge><p className="text-sm font-semibold">{alert.title}</p></div><p className="mt-1 text-xs text-[#9692a3]">{alert.detail}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={alert.status === "acknowledged"} onClick={() => void onAlertAction(alert.id, "acknowledge")}>Acknowledge</Button><Button size="sm" variant="outline" onClick={() => void onAlertAction(alert.id, "resolve")}>Resolve</Button></div></div>)}
      {unhealthyControls.map((control) => <div key={control.key} className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-800">{control.label}</p><p className="mt-1 text-xs text-red-700">{control.description}</p></div>)}
      {unhealthyJobs.map((job) => <div key={job.jobKey} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Worker: {job.jobKey}</p><p className="mt-1 text-xs text-amber-800">{job.consecutiveFailures} consecutive failures · {job.lagSeconds}s lag</p></div>)}
    </CardContent></Card>
    <ProviderReadinessPanel />
    <details className="group overflow-hidden rounded-2xl border bg-white"><summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold">Safety controls <ChevronRight className="size-4 transition group-open:rotate-90" /></summary><div className="grid gap-3 border-t p-5 lg:grid-cols-2">{snapshot.controls.map((control) => { const readOnly = control.key === "read_only_mode"; const healthy = readOnly ? !control.effectiveEnabled : control.effectiveEnabled; return <div key={control.key} className="flex items-start justify-between gap-3 rounded-xl border p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{control.label}</p><Badge variant="outline" className={healthy ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{control.effectiveEnabled ? "enabled" : "disabled"}</Badge></div><p className="mt-1 text-xs text-[#777287]">{control.description}</p></div>{snapshot.canManageControls && <Button size="sm" variant="outline" disabled={readOnly && control.deploymentForced} onClick={() => void onControlAction(control.key, !control.runtimeEnabled)}>{control.runtimeEnabled ? "Disable" : "Enable"}</Button>}</div>; })}</div></details>
    <details className="group overflow-hidden rounded-2xl border bg-white"><summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold">Advanced diagnostics <ChevronRight className="size-4 transition group-open:rotate-90" /></summary><div className="space-y-6 border-t p-5"><section><h3 className="text-sm font-semibold">Signals</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-[#9692a3]">{label}</p><p className={`mt-1 text-xl font-semibold ${value ? "text-amber-700" : ""}`}>{value}</p></div>)}</div></section><section><h3 className="text-sm font-semibold">Scheduled workers</h3><div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Failures</TableHead><TableHead>Lag</TableHead><TableHead>Last success</TableHead></TableRow></TableHeader><TableBody>{snapshot.jobs.map((job) => <TableRow key={job.jobKey}><TableCell className="font-medium">{job.jobKey}</TableCell><TableCell><Badge variant="outline">{job.status}</Badge></TableCell><TableCell>{job.consecutiveFailures}/{job.maxAttempts}</TableCell><TableCell>{job.lagSeconds}s</TableCell><TableCell>{job.lastSucceededAt ? new Date(job.lastSucceededAt).toLocaleString() : "Never"}</TableCell></TableRow>)}</TableBody></Table></div></section><section><h3 className="text-sm font-semibold">Recent audit activity</h3><div className="mt-3 space-y-2">{snapshot.recentAudit.slice(0, 20).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border p-3"><div><p className="text-sm font-medium">{item.action}</p><p className="text-xs text-[#9692a3]">{item.actorType} · {item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</p></div><span className="shrink-0 text-xs text-[#9692a3]">{new Date(item.createdAt).toLocaleString()}</span></div>)}</div></section></div></details>
  </div>;
}

function SettingsView({ serviceFee, exchangeRate, minimumFunding, botToken, showToken, telegramStatus, channels, newChannel, onServiceFee, onExchangeRate, onMinimumFunding, onSavePricing, onBotToken, onSaveBotToken, onClearBotToken, onShowToken, onConfigureWebhook, onNewChannel, onAddChannel, onRemoveChannel }: { serviceFee: number; exchangeRate: number; minimumFunding: number; botToken: string; showToken: boolean; telegramStatus: TelegramBotStatus | null; channels: string[]; newChannel: string; onServiceFee: (value: number) => void; onExchangeRate: (value: number) => void; onMinimumFunding: (value: number) => void; onSavePricing: () => void | Promise<void>; onBotToken: (value: string) => void; onSaveBotToken: () => void | Promise<void>; onClearBotToken: () => void | Promise<void>; onShowToken: (value: boolean) => void; onConfigureWebhook: () => void | Promise<void>; onNewChannel: (value: string) => void; onAddChannel: () => void | Promise<void>; onRemoveChannel: (channel: string) => void | Promise<void> }) {
  const [securityAdmin, setSecurityAdmin] = useState<CurrentAdmin | null>(null);
  const [securityPassword, setSecurityPassword] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [settingsTab, setSettingsTab] = useState("general");
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [payCard, setPayCard] = useState({ cardNumber: "", cardHolder: "" });
  const [firstCard, setFirstCard] = useState<{ minLoadUsd: number; onboardingBin: string; allowedBins: Array<{ bin: string; requiresDob: boolean }> }>({ minLoadUsd: 25, onboardingBin: "539502", allowedBins: [] });
  const [payBusy, setPayBusy] = useState(false);
  const [emailOAuth, setEmailOAuth] = useState<EmailOAuthSetup | null>(null);
  useEffect(() => { Promise.all([fetchPaymentCard(), fetchFirstCardSettings()]).then(([payment, onboarding]) => { setPayCard(payment); setFirstCard(onboarding); }).catch(() => {}); }, []);
  useEffect(() => { fetchEmailOAuthSetup().then(setEmailOAuth).catch(() => {}); }, []);
  const savePayCard = async () => {
    setPayBusy(true);
    try {
      await updatePaymentCard({
        cardNumber: payCard.cardNumber,
        cardHolder: payCard.cardHolder,
      });
      toast.success("Customer payment destination saved.");
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save payment card."); }
    finally { setPayBusy(false); }
  };
  const saveFirstCard = async () => {
    setPayBusy(true);
    try {
      await updateFirstCardSettings({ minLoadUsd: firstCard.minLoadUsd, onboardingBin: firstCard.onboardingBin });
      toast.success("First-card issuance settings saved.");
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save first-card settings."); }
    finally { setPayBusy(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentAdmin(controller.signal).then(setSecurityAdmin).catch(() => {});
    return () => controller.abort();
  }, []);

  const handleReauthenticate = async () => {
    if (!securityPassword) { toast.error("Enter your admin password first."); return; }
    setSecurityBusy(true);
    try {
      await reauthenticateAdmin(securityPassword, securityCode || undefined);
      setSecurityPassword("");
      toast.success("Recent admin authentication confirmed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Reauthentication failed."); }
    finally { setSecurityBusy(false); }
  };

  const handleMfaSetup = async () => {
    setSecurityBusy(true);
    try {
      const setup = await setupAdminMfa();
      setMfaSetup(setup);
      setSecurityCode("");
      toast.success("MFA secret created. Add it to your authenticator, then verify a code.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "MFA setup failed. Reauthenticate first."); }
    finally { setSecurityBusy(false); }
  };

  const handleMfaEnable = async () => {
    if (!/^\d{6}$/.test(securityCode)) { toast.error("Enter a 6-digit authenticator code."); return; }
    setSecurityBusy(true);
    try {
      await enableAdminMfa(securityCode);
      setMfaSetup(null);
      setSecurityCode("");
      setSecurityAdmin(await fetchCurrentAdmin());
      toast.success("TOTP MFA enabled for your admin account.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "MFA enable failed."); }
    finally { setSecurityBusy(false); }
  };

  const handleMfaDisable = async () => {
    if (!/^\d{6}$/.test(securityCode)) { toast.error("Enter the current 6-digit authenticator code."); return; }
    setSecurityBusy(true);
    try {
      await disableAdminMfa(securityCode);
      setSecurityCode("");
      setSecurityAdmin(await fetchCurrentAdmin());
      toast.success("TOTP MFA disabled.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "MFA disable failed. Reauthenticate first."); }
    finally { setSecurityBusy(false); }
  };

  const exampleAmount = 100;
  const providerFee = exampleAmount * 0.04 + 1;
  const ownFee = exampleAmount * (serviceFee / 100);
  const total = exampleAmount + providerFee + ownFee;
  return (
    <>
      <PageIntro title="Settings" description="Configure pricing, card issuance, Telegram, email, and admin security." />
      <div className="mb-4 flex flex-wrap gap-2">{([["general","General"],["telegram","Telegram"],["email","Email / 3DS"],["security","Security"]] as const).map(([v,l]) => <Button key={v} size="sm" variant={settingsTab===v?"default":"outline"} className="rounded-full" onClick={() => setSettingsTab(v)}>{l}</Button>)}</div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className={`surface-card rounded-[24px] xl:col-span-2 ${settingsTab==="security"?"":"hidden"}`}><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><ShieldCheck className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Admin security</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Server-side session, recent reauthentication, and TOTP multi-factor authentication.</p></div></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-full">{securityAdmin?.email ?? "Loading admin…"}</Badge><Badge variant="outline" className={securityAdmin?.mfaEnabled ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700" : "rounded-full border-amber-200 bg-amber-50 text-amber-700"}>{securityAdmin?.mfaEnabled ? "MFA enabled" : "MFA not enabled"}</Badge><Badge variant="outline" className="rounded-full">{securityAdmin?.role ?? "—"}</Badge></div><div className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><Input type="password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} placeholder="Admin password for reauthentication" /><Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit MFA code (if enabled)" /><Button variant="outline" disabled={securityBusy} onClick={() => void handleReauthenticate()} className="rounded-xl">Reauthenticate</Button></div>{!securityAdmin?.mfaEnabled && !mfaSetup && <div className="space-y-2"><Button disabled={securityBusy} onClick={() => void handleMfaSetup()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]">Set up authenticator MFA</Button><p className="text-xs leading-5 text-[#8f8b9c]">Before setting up MFA, enter your admin password above and click <b>Reauthenticate</b> — the server requires a recent re-authentication for this action.</p></div>}{mfaSetup && <div className="space-y-3 rounded-[16px] border border-[#dedaff] bg-[#f8f7ff] p-4"><p className="text-sm font-semibold">Add this secret to your authenticator app</p><p className="break-all rounded-xl bg-white p-3 font-mono text-sm">{mfaSetup.secret}</p><p className="break-all text-xs text-[#777287]">{mfaSetup.otpauthUri}</p><div className="flex gap-2"><Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Current 6-digit code" /><Button disabled={securityBusy} onClick={() => void handleMfaEnable()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]">Enable MFA</Button></div></div>}{securityAdmin?.mfaEnabled && <div className="flex items-center gap-2"><Button variant="outline" disabled={securityBusy} onClick={() => void handleMfaDisable()} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">Disable MFA</Button><p className="text-xs text-[#8f8b9c]">Requires recent reauthentication plus the current authenticator code.</p></div>}<p className="text-xs leading-5 text-[#8f8b9c]">Sensitive credential reveal requires a recent reauthentication window. Session and secret events are recorded in the immutable audit log.</p></CardContent></Card>
        <Card className={`surface-card rounded-[24px] ${settingsTab==="general"?"":"hidden"}`}><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><CircleDollarSign className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Existing-card top-ups</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Pricing used only when a customer adds money to a card they already have.</p></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="service-fee">Your top-up fee (%)</Label><Input id="service-fee" type="number" min="0" step="0.1" value={serviceFee} onChange={(event) => onServiceFee(Number(event.target.value))} /></div><div className="grid gap-2"><Label>Provider top-up fee</Label><Input value="4% + $1.00" readOnly className="bg-[#f8f7fb]" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="minimum-funding">Minimum existing-card top-up (USD)</Label><Input id="minimum-funding" type="number" min="1" step="1" value={minimumFunding} onChange={(event) => onMinimumFunding(Number(event.target.value))} /><p className="text-xs text-[#8f8b9c]">This does not affect first-card purchases. Their separate minimum appears below.</p></div></div><div className="grid gap-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="exchange-rate">Rial per 1 USD</Label><Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">Manual snapshot</Badge></div><Input id="exchange-rate" type="number" min="1" value={exchangeRate} onChange={(event) => onExchangeRate(Number(event.target.value))} /><div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3 text-xs leading-5 text-[#777287]"><p className="font-semibold text-[#353146]">Source: admin-approved manual snapshot</p><p>Saving creates a new immutable exchange-rate row used by new top-up quotes until it expires.</p><p className="mt-1 text-[#9692a3]">Existing requests never recalculate when this value changes.</p></div><Button variant="outline" className="mt-3 rounded-xl" onClick={() => void onSavePricing()}><Check className="size-4" />Save top-up pricing</Button></div><div className="hero-grid rounded-[20px] p-5 text-white"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#c8c3ff]">Example · $100 existing-card top-up</p><div className="mt-3 grid grid-cols-2 gap-4"><div><p className="text-sm text-[#aaa5c8]">USD basis</p><p className="mt-1 text-xl font-semibold">{formatUsd(total)}</p></div><div><p className="text-sm text-[#aaa5c8]">Client pays</p><p className="mt-1 text-xl font-semibold">{formatRial(total * exchangeRate)}</p></div></div><div className="mt-3 border-t border-white/10 pt-3 text-xs text-[#aaa5c8]">$100 + {formatUsd(providerFee)} provider + {formatUsd(ownFee)} service fee</div></div></CardContent></Card>

        <Card className={`surface-card rounded-[24px] ${settingsTab==="general"?"":"hidden"}`}><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><CreditCard className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Customer payment destination</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Customers pay this local card and upload a receipt. This is separate from Kripicard issuance.</p></div></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="pay-card-number">Card number</Label><Input id="pay-card-number" value={payCard.cardNumber} onChange={(e) => setPayCard((c) => ({ ...c, cardNumber: e.target.value }))} placeholder="6037-9911-2233-4455" className="bg-white" /></div><div className="grid gap-2"><Label htmlFor="pay-card-holder">Card holder name</Label><Input id="pay-card-holder" value={payCard.cardHolder} onChange={(e) => setPayCard((c) => ({ ...c, cardHolder: e.target.value }))} placeholder="Full name as on the card" className="bg-white" /></div></div><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={payBusy} onClick={() => void savePayCard()}><Check className="size-4" />Save payment destination</Button></CardContent></Card>
        <Card className={`surface-card rounded-[24px] ${settingsTab==="general"?"":"hidden"}`}><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#e6f8f1] text-[#16815e]"><WalletCards className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">First-card purchase</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Used only when a customer buys their first card during onboarding.</p></div></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-2"><Label htmlFor="pay-min-load">Minimum first-card purchase (USD)</Label><Input id="pay-min-load" type="number" min={1} value={firstCard.minLoadUsd} onChange={(e) => setFirstCard((c) => ({ ...c, minLoadUsd: Number(e.target.value) || 25 }))} className="bg-white" /><p className="text-xs text-[#8f8b9c]">The customer chooses an amount at or above this minimum. That approved amount becomes the card&apos;s initial balance. Customers never choose a BIN.</p></div><Button className="rounded-xl bg-[#167957] text-white hover:bg-[#116144]" disabled={payBusy} onClick={() => void saveFirstCard()}><Check className="size-4" />Save first-card minimum</Button></CardContent></Card>
        <Card className={`surface-card rounded-[24px] ${settingsTab==="telegram"?"":"hidden"}`}><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#f1eefe] text-[#7864c9]"><Bot className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Telegram bot</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Webhook readiness, server-side token status, and required channels.</p></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-2"><Label htmlFor="bot-token">Bot token</Label><div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Input id="bot-token" type={showToken ? "text" : "password"} value={botToken} onChange={(event) => onBotToken(event.target.value)} placeholder={telegramStatus?.tokenHint ? `Update token (current ends ${telegramStatus.tokenHint})` : "Paste bot token from @BotFather"} className="pr-10" autoComplete="off" /><button type="button" aria-label={showToken ? "Hide token" : "Show token"} onClick={() => onShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9692a3]">{showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={!botToken.trim()} onClick={() => void onSaveBotToken()}><Check className="size-4" />Save token</Button><Button variant="outline" className="rounded-xl" disabled={!telegramStatus?.configured} onClick={() => void onConfigureWebhook()}><Radio className="size-4" />Configure webhook</Button>{telegramStatus?.tokenSource === "database" && <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onClearBotToken()}><Trash2 className="size-4" />Clear</Button>}</div><p className="text-xs text-[#8f8b9c]">{telegramStatus?.tokenHint ? <>Current token: <code>••••{telegramStatus.tokenHint}</code> · stored {telegramStatus.tokenSource === "database" ? "encrypted in the database (set here)" : "in the server environment"}. Only the last 4 characters are ever shown.</> : <>Paste a token from <b>@BotFather</b> and click <b>Save token</b>. It is stored encrypted (AES-256-GCM); only the last 4 characters are shown afterward.</>}</p></div><div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3 text-sm"><div className="flex flex-wrap gap-2"><Badge variant="outline" className={telegramStatus?.configured ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700" : "rounded-full border-amber-200 bg-amber-50 text-amber-700"}>{telegramStatus?.configured ? "Bot configured" : "Bot not configured"}</Badge>{telegramStatus?.bot?.username && <Badge variant="outline" className="rounded-full">@{telegramStatus.bot.username}</Badge>}{telegramStatus?.webhook?.url && <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">Webhook connected</Badge>}</div><p className="mt-2 break-all text-xs text-[#777287]">Expected webhook: {telegramStatus?.expectedWebhookUrl ?? "Configure Telegram environment variables to inspect status."}</p>{telegramStatus?.webhook?.lastErrorMessage && <p className="mt-1 text-xs text-red-600">Telegram: {telegramStatus.webhook.lastErrorMessage}</p>}{telegramStatus?.error && <p className="mt-1 text-xs text-red-600">Telegram: {telegramStatus.error}</p>}</div><div><div className="mb-2 flex items-center justify-between"><Label>Force-join channels</Label><Badge variant="outline" className="rounded-full">{channels.length} required</Badge></div><div className="space-y-2">{channels.map((channel) => <div key={channel} className="flex items-center gap-3 rounded-[14px] border border-[#ebe9f1] bg-[#fbfafc] p-3"><Hash className="size-4 text-[#9692a3]" /><span className="flex-1 text-sm font-medium">{channel}</span><button onClick={() => void onRemoveChannel(channel)} className="text-[#9692a3] hover:text-red-600"><Trash2 className="size-4" /><span className="sr-only">Remove {channel}</span></button></div>)}</div><div className="mt-2 flex gap-2"><Input value={newChannel} onChange={(event) => onNewChannel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onAddChannel(); } }} placeholder="@channel_username" /><Button variant="outline" className="rounded-xl" onClick={() => void onAddChannel()}><Plus className="size-4" />Add</Button></div><p className="mt-2 text-xs text-[#8f8b9c]">Membership checks fail open on Telegram/API configuration errors so one broken channel cannot lock out every client; explicit left/kicked status is enforced.</p></div><Alert className="rounded-[16px] border-[#cfeadf] bg-[#f0faf6]"><CheckCircle2 className="text-[#167957]" /><AlertTitle className="text-[#245f4c]">Telegram backend implemented</AlertTitle><AlertDescription className="text-[#4f7669]">The bot uses verified and deduplicated webhooks, assignment and ban gates, opaque callbacks, guarded card actions, support relay, and durable OTP delivery.</AlertDescription></Alert></CardContent></Card>

        <Card className={`surface-card rounded-[24px] xl:col-span-2 ${settingsTab==="email"?"":"hidden"}`}><CardHeader><CardTitle>Email OAuth setup</CardTitle><p className="text-sm text-[#8f8b9c]">Create one OAuth application per provider and register the callback below. Each connected account authorizes separately and keeps its own encrypted token.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{(["outlook","gmail"] as const).map((provider) => { const setup = emailOAuth?.providers[provider]; const label = provider === "outlook" ? "Outlook / Hotmail" : "Gmail"; const consoleUrl = provider === "outlook" ? "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" : "https://console.cloud.google.com/apis/credentials"; return <div key={provider} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{label}</p><Badge variant="outline" className={setup?.configured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}>{setup?.configured ? "Configured" : "Missing credentials"}</Badge></div><a href={consoleUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6157e7] hover:underline">Open provider console<ExternalLink className="size-3.5" /></a><p className="mt-3 text-xs font-medium text-[#777287]">Authorized redirect URI</p><code className="mt-1 block break-all rounded-lg bg-slate-50 p-2 text-xs">{setup?.callbackUrl ?? "Loading…"}</code><ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-[#777287]"><li>Create a web application. For Microsoft, allow organizational and personal Microsoft accounts.</li><li>Add the exact redirect URI above. For Gmail, enable the Gmail API and configure the consent screen.</li><li>Set the client ID and secret below in the deployment environment, then restart the app.</li><li>Open Accounts, choose the matching provider, save, then click Connect for every mailbox.</li></ol><p className="mt-3 text-xs text-[#9692a3]">{provider === "outlook" ? "MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET" : "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET"}</p></div>; })}</CardContent></Card>
        <EmailRulesCard hidden={settingsTab !== "email"} />
      </div>
    </>
  );
}

function EmailRulesCard({ hidden }: { hidden: boolean }) {
  const [rules, setRules] = useState<Array<{ id: string; label: string; sender_match: string; subject_contains: string | null; category: string; otp_expiry_minutes: number; enabled: boolean }>>([]);
  const [draft, setDraft] = useState({ label: "", senderMatch: "", subjectContains: "", category: "otp_3ds" as "verification" | "security" | "otp_3ds", otpExpiryMinutes: 10 });
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    try { setRules((await fetchTrustedEmailRules()).items); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load trusted email rules."); }
  };
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetchTrustedEmailRules()
      .then((result) => { if (!cancelled) setRules(result.items); })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load trusted email rules."); });
    return () => { cancelled = true; };
  }, [hidden]);
  const add = async () => {
    if (!draft.label.trim() || !draft.senderMatch.trim()) { toast.error("Rule label and sender are required."); return; }
    setBusy(true);
    try {
      await createTrustedEmailRule({ ...draft, subjectContains: draft.subjectContains.trim() || null });
      setDraft({ label: "", senderMatch: "", subjectContains: "", category: "otp_3ds", otpExpiryMinutes: 10 });
      await reload();
      toast.success("Trusted email rule created.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create trusted rule."); }
    finally { setBusy(false); }
  };
  const toggle = async (id: string, enabled: boolean) => {
    setBusy(true);
    try { await updateTrustedEmailRule(id, enabled); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update trusted rule."); }
    finally { setBusy(false); }
  };
  return <Card className={`surface-card rounded-[24px] xl:col-span-2 ${hidden ? "hidden" : ""}`}><CardHeader><CardTitle>Email / 3DS trusted rules</CardTitle><p className="text-sm text-[#8f8b9c]">Only trusted sender/template matches can create OTP deliveries. Unknown OTP-like messages are quarantined.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Input value={draft.label} onChange={(e)=>setDraft((d)=>({...d,label:e.target.value}))} placeholder="Rule label" /><Input value={draft.senderMatch} onChange={(e)=>setDraft((d)=>({...d,senderMatch:e.target.value}))} placeholder="issuer@example.com or @domain.com" /><Input value={draft.subjectContains} onChange={(e)=>setDraft((d)=>({...d,subjectContains:e.target.value}))} placeholder="Subject contains (optional)" /><Select value={draft.category} onValueChange={(value)=>setDraft((d)=>({...d,category:value as typeof d.category}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="otp_3ds">3DS OTP</SelectItem><SelectItem value="security">Security</SelectItem><SelectItem value="verification">Verification</SelectItem></SelectContent></Select><Button disabled={busy} onClick={() => void add()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><Plus className="size-4" />Add rule</Button></div>
    <div className="space-y-2">{rules.map((rule)=><div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{rule.label}</p><p className="text-xs text-[#8f8b9c]">{rule.sender_match}{rule.subject_contains ? ` · subject: ${rule.subject_contains}` : ""} · {rule.category} · {rule.otp_expiry_minutes} min</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(rule.id,!rule.enabled)} className="rounded-xl">{rule.enabled ? "Disable" : "Enable"}</Button></div>)}{rules.length===0 && <p className="rounded-xl border border-dashed p-4 text-sm text-[#8f8b9c]">No trusted rules yet. Add a validated issuer sender/template before relying on OTP delivery.</p>}</div>
  </CardContent></Card>;
}

function OverviewV2({ clients, kycByUser, paymentByUser, paymentStatusByUser, fundingRequests, telegramStatus, onViewChange, onOpenClient }: { clients: Client[]; kycByUser: Record<string, "approved" | "pending" | "rejected">; paymentByUser: Record<string, boolean>; paymentStatusByUser: Record<string, string | null>; fundingRequests: FundingRequest[]; telegramStatus: TelegramBotStatus | null; onViewChange: (v: View) => void; onOpenClient: (id: string) => void }) {
  const kycPending = clients.filter((client) => kycByUser[client.telegramId] === "pending").length;
  const onboardingPending = clients.filter((client) => ["pending", "accepted", "card_creating", "card_reconciliation", "card_ready"].includes(paymentStatusByUser[client.id] ?? "")).length;
  const fundingOpen = fundingRequests.filter((request) => !["completed", "rejected", "cancelled"].includes(request.status)).length;
  const attention = kycPending + onboardingPending + fundingOpen;
  const active = clients.filter((client) => paymentStatusByUser[client.id] === "complete").length;
  const botLive = Boolean(telegramStatus?.configured && telegramStatus.webhook?.url);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const kycBadge = (status?: string) => status === "approved"
    ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Verified</Badge>
    : status === "pending"
      ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">KYC review</Badge>
      : status === "rejected"
        ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">KYC rejected</Badge>
        : <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Not verified</Badge>;
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#8179e8]">{today}</p>
          <h2 className="mt-2 text-[30px] font-bold tracking-[-.045em] text-[#1b1930] sm:text-[34px]">{attention > 0 ? `${attention} item${attention === 1 ? "" : "s"} need your attention` : "All caught up"}</h2>
          <p className="mt-1 text-[15px] text-[#7e7a8e]">{attention > 0 ? "Review KYC, first-card onboarding, and add-funds requests." : "No pending KYC, onboarding payments, or funding requests right now."}</p>
        </div>
        <Badge variant="outline" className={botLive ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700" : "rounded-full border-amber-200 bg-amber-50 text-amber-800"}>{botLive ? `Bot live · @${telegramStatus?.bot?.username ?? "bot"}` : "Bot not connected"}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "KYC to review", count: kycPending, hint: "identity submissions", go: () => onViewChange("requests") },
          { label: "First cards in progress", count: onboardingPending, hint: "payment / issuance incomplete", go: () => onViewChange("clients") },
          { label: "Funding open", count: fundingOpen, hint: "existing-card add-funds requests", go: () => onViewChange("requests") },
        ].map((card) => (
          <button key={card.label} onClick={card.go} className={`rounded-[20px] border p-5 text-left transition ${card.count > 0 ? "border-[#d8d3ff] bg-[#f6f4ff] hover:bg-[#efecff]" : "border-[#ece9f2] bg-white hover:bg-[#faf9fc]"}`}>
            <p className="text-3xl font-bold tracking-tight text-[#1b1930]">{card.count}</p>
            <p className="mt-1 text-sm font-semibold text-[#353146]">{card.label}</p>
            <p className="text-xs text-[#9692a3]">{card.hint}</p>
          </button>
        ))}
      </div>
      <Card className="mt-6 surface-card rounded-[24px]">
        <CardHeader><CardTitle className="text-[16px]">Customer pipeline <Badge variant="outline" className="ml-2 rounded-full">{active}/{clients.length} complete</Badge></CardTitle></CardHeader>
        <CardContent>
          {clients.length === 0 ? <p className="py-8 text-center text-sm text-[#9692a3]">No customers yet. They appear here after starting the bot.</p> : <div className="space-y-2">
            {clients.map((client) => {
              const paymentStatus = paymentStatusByUser[client.id] ?? null;
              return <button key={client.id} onClick={() => onOpenClient(client.id)} className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#ece9f2] bg-white p-3 text-left transition hover:bg-[#faf9fc]">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#353146]">{client.name}</p><p className="text-xs text-[#9692a3]">{client.username} · joined {client.joined}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  {kycBadge(kycByUser[client.telegramId])}
                  {paymentByUser[client.id] && paymentStatus !== "complete" && <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">{paymentStatus?.replaceAll("_", " ") ?? "payment"}</Badge>}
                  {paymentStatus === "complete" ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Card ready</Badge> : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Onboarding</Badge>}
                </div>
              </button>;
            })}
          </div>}
        </CardContent>
      </Card>
    </>
  );
}

function ClientKycSection({ clientId }: { clientId: string | null }) {
  const [kyc, setKyc] = useState<ClientKyc>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetchClientKyc(clientId).then((r) => { if (!cancelled) setKyc(r.kyc); }).catch(() => { if (!cancelled) setKyc(null); });
    return () => { cancelled = true; };
  }, [clientId]);
  if (!clientId) return null;
  if (!kyc) return <div className="border-b border-[#eceaf2] bg-[#f6f4ff] px-6 py-3 text-xs text-[#777287]">KYC: not submitted yet.</div>;
  const badge = kyc.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : kyc.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className="border-b border-[#eceaf2] bg-[#f6f4ff] px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8179e8]">KYC</p>
        <Badge variant="outline" className={`rounded-full ${badge}`}>{kyc.status}</Badge>
        {kyc.hasDocument && <button type="button" onClick={() => openAdminAttachment({ url: kycDocumentUrl(kyc.id), title: `KYC document · ${kyc.fullName}`, filename: "kyc-document", mimeType: kyc.documentMimeType })} className="text-xs font-semibold text-[#6157e7] underline-offset-2 hover:underline">View ID document</button>}
      </div>
      <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-[#55516b] sm:grid-cols-2">
        <p><span className="text-[#9692a3]">Name:</span> {kyc.fullName}</p>
        <p><span className="text-[#9692a3]">DOB:</span> {kyc.dateOfBirth ?? "—"}</p>
        <p><span className="text-[#9692a3]">Country:</span> {kyc.country}</p>
        <p><span className="text-[#9692a3]">National ID:</span> {kyc.nationalId}</p>
        <p><span className="text-[#9692a3]">Phone:</span> {kyc.phone}</p>
        <p><span className="text-[#9692a3]">Delivery:</span> {[kyc.deliveryAddressLine, kyc.deliveryCity, kyc.deliveryProvince, kyc.deliveryCountry, kyc.deliveryPostalCode].filter(Boolean).join(", ") || "—"}</p>
        <p><span className="text-[#9692a3]">Submitted:</span> {new Date(kyc.submittedAt).toLocaleString()}</p>
      </div>
      {kyc.reviewNote && <p className="mt-1 text-xs text-[#777287]">Note: {kyc.reviewNote}</p>}
    </div>
  );
}

function ClientPaymentSection({ clientId }: { clientId: string | null }) {
  const [payment, setPayment] = useState<ClientPayment>(null);
  const [accounts, setAccounts] = useState<AssignableClientAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [reauthAction, setReauthAction] = useState<"create_card" | "reconcile_card" | null>(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthCode, setReauthCode] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [walletGate, setWalletGate] = useState<ProviderWalletGate | null>(null);
  const [walletConfirmed, setWalletConfirmed] = useState(false);
  const [existingCards, setExistingCards] = useState<ApiCard[]>([]);
  const [existingCardId, setExistingCardId] = useState("");

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    Promise.all([fetchClientKyc(clientId), fetchClientAssignableAccounts(clientId)])
      .then(([detail, assignable]) => {
        if (cancelled) return;
        setPayment(detail.payment ?? null);
        setAccounts(assignable.items);
        const selected = assignable.items.find((item) => item.selected);
        if (selected) setAccountId(selected.id);
      })
      .catch(() => { if (!cancelled) setPayment(null); });
    return () => { cancelled = true; };
  }, [clientId, tick]);

  if (!clientId || !payment || (!payment.declaredAt && !payment.hasReceipt && !payment.status)) return null;

  const applyActionResult = (
    action: "accept" | "deny" | "create_card" | "attach_existing_card" | "reconcile_card" | "complete",
    result: Awaited<ReturnType<typeof activateClient>>,
  ) => {
    if (action === "accept") toast.success("Receipt accepted. Choose a Kripicard account and create the first card.");
    else if (action === "deny") toast.success("Payment denied. The customer can submit a new amount and receipt.");
    else if (action === "create_card") {
      if (result.needsReconciliation) toast.warning("Provider outcome is uncertain. Do not retry card creation; use Reconcile first card.");
      else toast.success(`First card created${result.cardLast4 ? ` · •${result.cardLast4}` : ""}. Review it, then complete onboarding.`);
    } else if (action === "reconcile_card") {
      if (result.needsReconciliation) toast.warning("The provider outcome is still uncertain.");
      else toast.success(`First-card issuance reconciled${result.cardLast4 ? ` · •${result.cardLast4}` : ""}.`);
    } else if (action === "attach_existing_card") {
      toast.success(`Existing Kripicard attached${result.cardLast4 ? ` · •${result.cardLast4}` : ""}. Review it, then complete onboarding.`);
    } else toast.success("Onboarding completed. The customer was notified and can now use the card menu.");
    setTick((value) => value + 1);
  };

  const act = async (
    action: "accept" | "deny" | "create_card" | "attach_existing_card" | "reconcile_card" | "complete",
    options: { allowReauthPrompt?: boolean; walletFundingConfirmed?: boolean; cardId?: string } = { allowReauthPrompt: true },
  ) => {
    setBusy(true);
    try {
      const result = await activateClient(clientId, { action, accountId: accountId || undefined, cardId: options.cardId, walletFundingConfirmed: options.walletFundingConfirmed });
      applyActionResult(action, result);
    } catch (error) {
      if (
        options.allowReauthPrompt !== false &&
        error instanceof AdminApiError &&
        error.code === "reauthentication_required" &&
        (action === "create_card" || action === "reconcile_card")
      ) {
        setReauthAction(action);
        return;
      }
      if (error instanceof AdminApiError && error.code === "mfa_required") {
        toast.error("Enable MFA in Settings → Security before performing live provider card writes.");
        return;
      }
      if (error instanceof AdminApiError && error.code === "feature_disabled") {
        toast.error("Live card creation is disabled by deployment configuration. Enable the live-provider and card-creation environment gates, including LIVE_PROVIDER_WRITE_CONFIRMATION, then recreate the app and worker containers.");
        return;
      }
      if (error instanceof AdminApiError && error.code === "runtime_kill_switch") {
        toast.error("Live card creation is disabled by an emergency runtime control. Open Operations and enable both Provider writes and Card creation.");
        return;
      }
      if (error instanceof AdminApiError && error.code === "provider_money_not_ready") {
        const details = error.details as { blockers?: unknown } | undefined;
        const blockers = Array.isArray(details?.blockers) ? details.blockers.filter((value): value is string => typeof value === "string") : [];
        toast.error(blockers.length
          ? `Card creation is blocked by provider readiness: ${blockers.join(", ")}. Review Operations → Kripicard.`
          : error.message);
        return;
      }
      if (error instanceof AdminApiError && error.code === "read_only_mode") {
        toast.error("AccAbad is in emergency read-only mode. Disable Read-only mode from Operations before creating a card.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Onboarding action failed.");
    } finally {
      setBusy(false);
    }
  };

  const loadExistingCards = async () => {
    if (!accountId) return;
    setBusy(true);
    try {
      await syncAccountCards(accountId);
      const result = await fetchAccountCards(accountId);
      const available = result.items.filter((card) => !["closed", "expired"].includes(card.status));
      setExistingCards(available);
      setExistingCardId(available[0]?.id ?? "");
      if (!available.length) toast.info("No attachable cards were found in this Kripicard account.");
      else toast.success(`${available.length} existing card${available.length === 1 ? "" : "s"} found.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not synchronize existing cards.");
    } finally {
      setBusy(false);
    }
  };

  const submitReauthentication = async () => {
    if (!reauthAction || !reauthPassword.trim()) return;
    const pendingAction = reauthAction;
    setReauthBusy(true);
    try {
      await reauthenticateAdmin(reauthPassword, reauthCode.trim() || undefined);
      setReauthAction(null);
      setReauthPassword("");
      setReauthCode("");
      toast.success("Reauthenticated. Continuing the provider action.");
      await act(pendingAction, { allowReauthPrompt: false, walletFundingConfirmed: pendingAction === "create_card" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
    } finally {
      setReauthBusy(false);
    }
  };

  const status = payment.status ?? "waiting";
  const labels: Record<string, string> = {
    pending: "Receipt pending review",
    accepted: "Payment accepted",
    card_creating: "Creating first card",
    card_reconciliation: "Card needs reconciliation",
    card_ready: "First card ready",
    complete: "Complete",
    denied: "Payment denied",
  };
  const badgeClass = status === "complete" || status === "card_ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "denied"
      ? "border-red-200 bg-red-50 text-red-700"
      : status === "card_reconciliation"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : status === "accepted"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <>
    <div className="border-b border-[#eceaf2] bg-[#efeaff] px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8179e8]">First-card onboarding</p>
        <Badge variant="outline" className={`rounded-full ${badgeClass}`}>{labels[status] ?? status.replaceAll("_", " ")}</Badge>
        {payment.amountUsdCents && <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">{formatUsd(Number(payment.amountUsdCents) / 100)} first-card balance</Badge>}
        {payment.onboardingCardLast4 && <Badge variant="outline" className="rounded-full border-indigo-200 bg-white text-indigo-700">Card •{payment.onboardingCardLast4}</Badge>}
        {payment.hasReceipt
          ? <button type="button" onClick={() => openAdminAttachment({ url: clientReceiptUrl(clientId), title: "First-card payment receipt", filename: "first-card-payment-receipt", mimeType: payment.receiptMime })} className="text-xs font-semibold text-[#6157e7] underline-offset-2 hover:underline">View receipt</button>
          : <span className="text-xs font-semibold text-red-600">Receipt required</span>}
      </div>

      {status === "pending" && <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={busy || !payment.hasReceipt} onClick={() => void act("accept")}><Check className="size-4" />Accept receipt</Button>
        <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => void act("deny")}><XCircle className="size-4" />Deny</Button>
      </div>}

      {(status === "accepted" || status === "card_creating") && <div className="mt-3 space-y-2">
        <p className="text-xs leading-5 text-[#6f6982]">Select the Kripicard account that will own this customer&apos;s first card. The accepted payment amount becomes the card&apos;s initial balance.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setExistingCards([]); setExistingCardId(""); }} className="h-9 min-w-[220px] rounded-xl border border-[#e3e0eb] bg-white px-2 text-sm">
            <option value="">Choose Kripicard account…</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}{account.selected ? " · assigned" : ""}</option>)}
          </select>
          <Button size="sm" className="rounded-xl bg-[#167957] text-white hover:bg-[#116144]" disabled={busy || !accountId} onClick={() => { setBusy(true); fetchProviderWalletGate(accountId).then((details) => { setWalletConfirmed(false); setWalletGate(details); }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not prepare the Kripicard wallet step.")).finally(() => setBusy(false)); }}><CreditCard className="size-4" />Prepare crypto & create</Button>
        </div>
      </div>}

      {status === "card_reconciliation" && <div className="mt-3 space-y-2">
        <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="text-amber-700" /><AlertTitle>Provider outcome uncertain</AlertTitle><AlertDescription>Do not send another provider create-card call. Reconcile the existing operation.</AlertDescription></Alert>
        <Button size="sm" variant="outline" className="rounded-xl border-amber-300 bg-white text-amber-900" disabled={busy} onClick={() => void act("reconcile_card")}><RefreshCw className="size-4" />Reconcile first card</Button>
      </div>}

      {["accepted", "card_creating", "card_reconciliation"].includes(status) && <div className="mt-3 rounded-xl border border-[#ddd9f5] bg-white p-3">
        <p className="text-sm font-semibold text-[#353146]">Already created in Kripicard?</p>
        <p className="mt-1 text-xs leading-5 text-[#777287]">Choose the owning account above, synchronize it, then attach the provider card to this customer&apos;s request.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" disabled={busy || !accountId} onClick={() => void loadExistingCards()}><RefreshCw className="size-4" />Sync existing cards</Button>
          {existingCards.length > 0 && <select value={existingCardId} onChange={(event) => setExistingCardId(event.target.value)} className="h-9 min-w-[220px] rounded-xl border border-[#e3e0eb] bg-white px-2 text-sm"><option value="">Choose existing card…</option>{existingCards.map((card) => <option key={card.id} value={card.id}>•{card.last4 ?? "????"} · {card.cardholderName ?? "Unnamed"} · {card.status}</option>)}</select>}
          {existingCards.length > 0 && <Button size="sm" className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={busy || !existingCardId} onClick={() => void act("attach_existing_card", { cardId: existingCardId })}><Check className="size-4" />Attach to request</Button>}
        </div>
      </div>}

      {status === "card_ready" && <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-[#5f596f]">The real provider card exists{payment.onboardingCardLast4 ? ` as •${payment.onboardingCardLast4}` : ""}. Complete onboarding to unlock the customer&apos;s Telegram card menu.</p>
        <Button size="sm" className="rounded-xl bg-[#167957] text-white hover:bg-[#116144]" disabled={busy} onClick={() => void act("complete")}><CheckCircle2 className="size-4" />Complete & notify</Button>
      </div>}

      {status === "complete" && <p className="mt-2 text-xs text-emerald-700">Onboarding is complete. The customer can view the card, balance, transactions, support, and add-funds flow.</p>}
      {status === "denied" && <p className="mt-2 text-xs text-red-700">The customer was notified and can choose a new amount and upload a replacement receipt.</p>}
    </div>

    <Dialog open={Boolean(walletGate)} onOpenChange={(open) => { if (!open) { setWalletGate(null); setWalletConfirmed(false); } }}>
      <DialogContent className="rounded-[24px] border-[#e5e2ee] sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Fund Kripicard wallet with crypto</DialogTitle><DialogDescription>The initial card balance is debited from the selected Kripicard account wallet. Deposit crypto in Kripicard first.</DialogDescription></DialogHeader>
        {walletGate && <div className="space-y-4"><div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="font-semibold">{walletGate.accountLabel}</p><p className="text-xs text-[#777287]">{walletGate.loginEmail}</p><p className="mt-2">Initial card amount: <b>{formatUsd(Number(payment.amountUsdCents ?? "0") / 100)}</b></p></div><a href={walletGate.portalUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full rounded-xl"><ExternalLink className="size-4" />Open Kripicard crypto deposit</Button></a><label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={walletConfirmed} onCheckedChange={(value) => setWalletConfirmed(value === true)} /><span>I deposited crypto into this exact Kripicard account and waited for it to be credited.</span></label></div>}
        <DialogFooter><Button variant="outline" onClick={() => setWalletGate(null)}>Cancel</Button><Button disabled={!walletConfirmed} onClick={() => { setWalletGate(null); setWalletConfirmed(false); void act("create_card", { walletFundingConfirmed: true }); }}>Continue to create card</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(reauthAction)} onOpenChange={(open) => {
      if (!open && !reauthBusy) {
        setReauthAction(null);
        setReauthPassword("");
        setReauthCode("");
      }
    }}>
      <DialogContent className="rounded-[24px] border-[#e5e2ee] sm:max-w-[430px]">
        <DialogHeader>
          <DialogTitle>Confirm live provider action</DialogTitle>
          <DialogDescription>
            Card creation and reconciliation require a recently reauthenticated admin session. Re-enter your admin credentials, then AccAbad will continue the same action automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="onboarding-reauth-password">Admin password</Label>
            <Input
              id="onboarding-reauth-password"
              type="password"
              autoComplete="current-password"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && reauthPassword.trim()) void submitReauthentication(); }}
              disabled={reauthBusy}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="onboarding-reauth-code">MFA code <span className="font-normal text-[#9692a3]">(if enabled)</span></Label>
            <Input
              id="onboarding-reauth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={reauthCode}
              onChange={(event) => setReauthCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => { if (event.key === "Enter" && reauthPassword.trim()) void submitReauthentication(); }}
              disabled={reauthBusy}
              placeholder="123456"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" disabled={reauthBusy} onClick={() => {
            setReauthAction(null);
            setReauthPassword("");
            setReauthCode("");
          }}>Cancel</Button>
          <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={reauthBusy || !reauthPassword.trim()} onClick={() => void submitReauthentication()}>
            {reauthBusy ? "Verifying…" : "Reauthenticate & continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
