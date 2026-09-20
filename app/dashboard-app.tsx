"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Hash,
  KeyRound,
  Landmark,
  LayoutDashboard,
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
import { AdminApiError, createAccount, fetchDashboardSnapshot, reauthenticateAdmin, revealAccountSecrets, updateAccount, verifyAccountConnection, syncAccountCards, revealLiveCardDetails, syncCardTransactions, fetchCardTransactions, fetchTransactions, fetchTransactionNotificationIssues, reconcileTransactionNotification, setCardFrozenState, refreshCardStatus, connectOutlookMailbox, syncOutlookMailbox, disconnectOutlookMailbox, connectGmailMailbox, syncGmailMailbox, disconnectGmailMailbox, fetchAccountEmailMessages, fetchTelegramBotStatus, configureTelegramWebhook, setTelegramBotToken, clearTelegramBotToken, fetchForceJoinChannels, upsertForceJoinChannel, deleteForceJoinChannel, fetchSupportConversations, updateSupportConversation, retrySupportMessage, fetchClientSupportMessages, sendClientSupportMessage, fetchClientAssignableAccounts, assignClientAccount, unassignClientAccount, unassignAllClientAccounts, fetchCardRequests, reviewCardRequest, issueCardRequest, reconcileCardRequest, fetchFundingRequests, reviewFundingRequest, executeFundingRequest, reconcileFundingRequest, resolveFundingRequest, fundingReceiptDownloadUrl, fetchFundingSettings, updateFundingSettings, type ApiCardRequest, type ApiFundingRequest, type AssignableClientAccount, type LiveCardDetails, type StoredCardTransaction, type StoredEmailMessage, type TelegramBotStatus, fetchProviderReadiness, type ProviderReadinessSnapshot, type TransactionNotificationIssue, type SupportConversationSummary, fetchOperationalSnapshot, updateOperationalAlert, updateRuntimeControl, type OperationalSnapshot, fetchKycSubmissions, reviewKycSubmission, kycDocumentUrl, type ApiKycSubmission } from "@/lib/admin-api";
import { disableAdminMfa, enableAdminMfa, fetchCurrentAdmin, logoutAdmin, setupAdminMfa, type CurrentAdmin } from "@/lib/auth-client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  | "kyc"
  | "requests"
  | "transactions"
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
};

type FundingStatus = "pending_receipt" | "pending_review" | "correction_needed" | "accepted" | "funding" | "funding_failed" | "needs_reconciliation" | "completed" | "rejected" | "cancelled";
type CryptoPaymentStage = "form" | "payment" | "completed";

type FundingRequest = {
  id: string;
  reference?: string;
  clientId: string;
  cardLast4: string;
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

type CardRequest = {
  id: string;
  reference: string;
  clientId: string;
  bin: string;
  initialAmount: number;
  nameOnCard: string;
  email: string;
  dateOfBirth: string | null;
  selectedAccountId: string | null;
  eligibleAccounts: Array<{ id: string; label: string; loginEmail: string; status: string }>;
  adminNote: string | null;
  status: "New" | "Approved" | "Correction needed" | "Issuing" | "Issue failed" | "Needs reconciliation" | "Issued" | "Rejected" | "Cancelled";
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
  status?: string;
  lastDeliveryError?: string | null;
  attachment?: { filename: string; downloadUrl?: string | null; mimeType?: string | null } | null;
};

const initialAccounts: Account[] = [
  {
    id: "acc-primary",
    name: "Primary Cards",
    owner: "accabad.primary.demo@outlook.com",
    mailbox: "accabad.primary.demo@outlook.com",
    password: "••••••••",
    keyHint: "••••••••7KQ9",
    mailProvider: "Outlook / Hotmail",
    accountBalance: 0,
    cardBalance: 230.5,
    cards: 2,
    status: "Connected",
    lastSync: "1 min ago",
    emailConnectionStatus: "not_connected",
    emailProviderIdentity: null,
    emailLastSyncedAt: null,
    emailError: null,
  },
  {
    id: "acc-media",
    name: "Media Operations",
    owner: "accabad.media.demo@gmail.com",
    mailbox: "accabad.media.demo@gmail.com",
    password: "••••••••",
    keyHint: "••••••••2PA4",
    mailProvider: "Gmail",
    accountBalance: 0,
    cardBalance: 1205.2,
    cards: 3,
    status: "Connected",
    lastSync: "4 min ago",
    emailConnectionStatus: "not_connected",
    emailProviderIdentity: null,
    emailLastSyncedAt: null,
    emailError: null,
  },
  {
    id: "acc-reserve",
    name: "Reserve Pool",
    owner: "accabad.reserve.demo@hotmail.com",
    mailbox: "accabad.reserve.demo@hotmail.com",
    password: "••••••••",
    keyHint: "••••••••8DW1",
    mailProvider: "Outlook / Hotmail",
    accountBalance: 0,
    cardBalance: 16.4,
    cards: 1,
    status: "Attention",
    lastSync: "2 hr ago",
    emailConnectionStatus: "not_connected",
    emailProviderIdentity: null,
    emailLastSyncedAt: null,
    emailError: null,
  },
];

const initialClients: Client[] = [
  {
    id: "usr-amir",
    name: "Amir Karimi",
    username: "@amir_k",
    telegramId: "7421083921",
    accountIds: ["acc-primary"],
    joined: "Aug 12, 2026",
    banned: false,
    totalFunded: 1260,
  },
  {
    id: "usr-sara",
    name: "Sara Mirzaei",
    username: "@sara_media",
    telegramId: "6049032158",
    accountIds: ["acc-media"],
    joined: "Aug 18, 2026",
    banned: false,
    totalFunded: 2840,
  },
  {
    id: "usr-nima",
    name: "Nima Rahimi",
    username: "@nimarah",
    telegramId: "7832140097",
    accountIds: [],
    joined: "Aug 29, 2026",
    banned: false,
    totalFunded: 0,
  },
  {
    id: "usr-parsa",
    name: "Parsa Ahmadi",
    username: "@parsaa",
    telegramId: "5218004926",
    accountIds: ["acc-reserve"],
    joined: "Jul 30, 2026",
    banned: true,
    totalFunded: 450,
  },
];

const initialCards: ClientCard[] = [
  { id: "MR_A1B2C3D4", accountId: "acc-primary", bin: "539502", cardholder: "Amir Karimi", email: "card-4321@3ds.company.co", last4: "4321", label: "Subscriptions", balance: 188.5, frozen: false, expiry: "12/27" },
  { id: "VC_X9Y8Z7W6", accountId: "acc-primary", bin: "525847", cardholder: "Amir Karimi", email: "card-7890@3ds.company.co", last4: "7890", label: "Advertising", balance: 42, frozen: true, expiry: "09/28" },
  { id: "MR_N8A1H55P", accountId: "acc-media", bin: "537872", cardholder: "Sara Mirzaei", email: "card-1188@3ds.company.co", last4: "1188", label: "Meta Ads", balance: 820, frozen: false, expiry: "02/29" },
  { id: "MR_R5P2L90Q", accountId: "acc-media", bin: "533171", cardholder: "Sara Mirzaei", email: "card-6134@3ds.company.co", last4: "6134", label: "Google Ads", balance: 310.2, frozen: false, expiry: "06/29" },
  { id: "MR_T2N4D70L", accountId: "acc-media", bin: "539502", cardholder: "Sara Mirzaei", email: "card-9044@3ds.company.co", last4: "9044", label: "Tools", balance: 75, frozen: false, expiry: "01/29" },
  { id: "MR_P3A9Q22V", accountId: "acc-reserve", bin: "246001", cardholder: "Parsa Ahmadi", email: "card-2207@3ds.company.co", last4: "2207", label: "General", balance: 16.4, frozen: true, expiry: "11/28" },
];

const initialAccountEmails: AccountEmail[] = [
  { id: "em-1006", accountId: "acc-primary", category: "3DS", sender: "card-security@issuer.example", subject: "Your verification code", preview: "Use 384921 to complete your card payment.", body: "Your one-time verification code is 384921. It expires shortly. Do not share this code with anyone outside the payment you initiated.", received: "2 min ago", cardLast4: "4321", unread: true },
  { id: "em-1005", accountId: "acc-primary", category: "Security", sender: "security@kripicard.example", subject: "New account sign-in", preview: "A new sign-in was detected for this account.", body: "A new administrator sign-in was detected. If this was not you, reset the account password and rotate the API key.", received: "Yesterday", unread: false },
  { id: "em-1004", accountId: "acc-media", category: "3DS", sender: "authentication@issuer.example", subject: "Confirm online purchase", preview: "Verification code 710044 for card ending 1188.", body: "Enter verification code 710044 to confirm the online purchase made with card ending 1188.", received: "18 min ago", cardLast4: "1188", unread: true },
  { id: "em-1003", accountId: "acc-media", category: "Account", sender: "support@kripicard.example", subject: "Card funding completed", preview: "An administrator-funded card top-up was confirmed.", body: "Legacy prototype-only funding example. Production AccAbad executes card funding only from an accepted funding request through the guarded Phase 16 workflow.", received: "3 hr ago", unread: false },
  { id: "em-1002", accountId: "acc-reserve", category: "Security", sender: "security@kripicard.example", subject: "API connection needs attention", preview: "Reconnect this account to resume synchronization.", body: "The API connection could not be verified. Review the API key in Account connections and try syncing again.", received: "2 hr ago", unread: true },
];

const initialFundingRequests: FundingRequest[] = [
  {
    id: "FR-1048",
    clientId: "usr-amir",
    cardLast4: "4321",
    amount: 300,
    providerFee: 13,
    serviceFee: 7.5,
    rialTotal: 708_946_000,
    receipt: "receipt-1048.jpg",
    receiptType: "image",
    status: "pending_review",
    submitted: "8 min ago",
  },
  {
    id: "FR-1047",
    clientId: "usr-sara",
    cardLast4: "1188",
    amount: 500,
    providerFee: 21,
    serviceFee: 12.5,
    rialTotal: 1_180_102_000,
    receipt: "bank-slip.pdf",
    receiptType: "pdf",
    status: "accepted",
    submitted: "26 min ago",
  },
  {
    id: "FR-1046",
    clientId: "usr-amir",
    cardLast4: "7890",
    amount: 100,
    providerFee: 5,
    serviceFee: 2.5,
    rialTotal: 237_790_000,
    receipt: "payment-video.mp4",
    receiptType: "video",
    status: "funding",
    submitted: "1 hr ago",
  },
  {
    id: "FR-1045",
    clientId: "usr-sara",
    cardLast4: "6134",
    amount: 200,
    providerFee: 9,
    serviceFee: 5,
    rialTotal: 473_368_000,
    receipt: "Transfer ref: 8830941",
    receiptType: "text",
    status: "completed",
    submitted: "Yesterday",
  },
];

const initialCardRequests: CardRequest[] = [
  { id: "CR-221", reference: "CR-221", clientId: "usr-nima", bin: "537872", initialAmount: 20, nameOnCard: "Nima Rahimi", email: "nima@example.com", dateOfBirth: "1990-01-15", selectedAccountId: null, eligibleAccounts: [], adminNote: null, status: "New", submitted: "14 min ago" },
  { id: "CR-220", reference: "CR-220", clientId: "usr-amir", bin: "539502", initialAmount: 50, nameOnCard: "Amir Karimi", email: "amir@example.com", dateOfBirth: null, selectedAccountId: null, eligibleAccounts: [], adminNote: null, status: "Approved", submitted: "2 hr ago" },
  { id: "CR-219", reference: "CR-219", clientId: "usr-sara", bin: "525847", initialAmount: 100, nameOnCard: "Sara Mirzaei", email: "sara@example.com", dateOfBirth: null, selectedAccountId: null, eligibleAccounts: [], adminNote: null, status: "Issued", submitted: "Yesterday" },
];

const initialTransactions: Transaction[] = [
  { id: "TX-8901", clientId: "usr-amir", accountId: "acc-primary", cardLast4: "4321", merchant: "AMAZON.COM", amount: -14.99, type: "Authorize", status: "Success", date: "Sep 4 · 10:44" },
  { id: "TX-8900", clientId: "usr-sara", accountId: "acc-media", cardLast4: "1188", merchant: "META *ADS", amount: -124, type: "Authorize", status: "Success", date: "Sep 4 · 09:12" },
  { id: "TX-8899", clientId: "usr-amir", accountId: "acc-primary", cardLast4: "4321", merchant: "SPOTIFY", amount: -9.99, type: "Authorize", status: "Failed", date: "Sep 3 · 18:02" },
  { id: "TX-8898", clientId: "usr-sara", accountId: "acc-media", cardLast4: "6134", merchant: "Card funding", amount: 200, type: "Funding", status: "Success", date: "Sep 3 · 16:44" },
  { id: "TX-8897", clientId: "usr-amir", accountId: "acc-primary", cardLast4: "7890", merchant: "GOOGLE *TEMPORARY HOLD", amount: 0, type: "OTP", status: "Success", date: "Sep 3 · 14:07" },
];

const initialMessages: Record<string, Message[]> = {
  "usr-amir": [
    { id: "m1", from: "client", body: "Hi, I uploaded the receipt for my $300 funding request.", time: "10:18" },
    { id: "m2", from: "admin", body: "Thanks. We are checking it now and you will see each status update in the bot.", time: "10:20" },
    { id: "m3", from: "client", body: "Perfect, thank you.", time: "10:21", attachment: { filename: "receipt-1048.jpg" } },
  ],
  "usr-sara": [
    { id: "m4", from: "client", body: "Can you tell me when the Meta card is ready?", time: "09:42" },
    { id: "m5", from: "admin", body: "It is approved and waiting for provider funding.", time: "09:45" },
  ],
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

const binOptions = [
  { value: "539502", label: "539502 · Hong Kong" },
  { value: "525847", label: "525847 · Hong Kong" },
  { value: "539578", label: "539578 · Hong Kong" },
  { value: "525797", label: "525797 · Hong Kong" },
  { value: "235019", label: "235019 · Hong Kong" },
  { value: "223600", label: "223600 · Hong Kong" },
  { value: "238003", label: "238003 · Hong Kong" },
  { value: "537872", label: "537872 · US", requiresDob: true },
  { value: "533171", label: "533171 · Singapore", requiresDob: true },
  { value: "246001", label: "246001 · UK", requiresDob: true },
];

const navItems: { view: View; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "accounts", label: "Accounts", icon: WalletCards },
  { view: "clients", label: "Clients", icon: Users },
  { view: "kyc", label: "KYC", icon: UserRoundCheck },
  { view: "requests", label: "Requests", icon: ReceiptText },
  { view: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { view: "inbox", label: "Inbox", icon: MessagesSquare },
  { view: "operations", label: "Operations", icon: Activity },
  { view: "settings", label: "Settings", icon: Settings2 },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Card operations across every connected account." },
  accounts: { title: "Kripicard accounts", description: "API connections, card funding, and card exposure." },
  clients: { title: "Telegram clients", description: "Account assignments, cards, access, and activity." },
  kyc: { title: "Customer KYC", description: "Identity verifications submitted through the Telegram bot." },
  requests: { title: "Requests", description: "Review client payments and new card requests." },
  transactions: { title: "Transactions", description: "Provider activity across every client card." },
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
    body: message.preview || "Message body storage is intentionally deferred; this is the provider preview synchronized by AccAbad.",
    received: formatApiDateTime(message.receivedAt),
    unread: message.unread,
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

function mapApiCardRequest(request: ApiCardRequest): CardRequest {
  const statusMap: Record<ApiCardRequest["status"], CardRequest["status"]> = {
    pending_review: "New",
    approved: "Approved",
    correction_needed: "Correction needed",
    issuing: "Issuing",
    issue_failed: "Issue failed",
    needs_reconciliation: "Needs reconciliation",
    issued: "Issued",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return {
    id: request.id,
    reference: request.reference,
    clientId: request.userId,
    bin: request.bin,
    initialAmount: Number(request.initialAmountUsdCents) / 100,
    nameOnCard: request.nameOnCard,
    email: request.email,
    dateOfBirth: request.dateOfBirth,
    selectedAccountId: request.selectedAccountId,
    eligibleAccounts: request.eligibleAccounts,
    adminNote: request.adminNote,
    status: statusMap[request.status],
    submitted: formatApiDate(request.createdAt),
  };
}

function mapApiFundingRequest(request: ApiFundingRequest): FundingRequest {
  const mime = request.receipt?.detected_mime_type ?? "";
  const receiptType: FundingRequest["receiptType"] = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : "text";
  return {
    id: request.id,
    reference: request.reference,
    clientId: request.userId,
    cardLast4: request.card?.last4 ?? "????",
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

function AccountAssignmentPicker({ accounts, clients, client, backendDataLoaded, assignmentPendingId, onToggle, onDisconnectAll }: {
  accounts: Account[];
  clients: Client[];
  client: Client;
  backendDataLoaded: boolean;
  assignmentPendingId: string | null;
  onToggle: (clientId: string, accountId: string) => void | Promise<void>;
  onDisconnectAll: (clientId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [remoteAccounts, setRemoteAccounts] = useState<AssignableClientAccount[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const selectedAccounts = accounts.filter((account) => client.accountIds.includes(account.id));
  const selectedRemoteOnly = remoteAccounts
    .filter((item) => item.selected && !accounts.some((account) => account.id === item.id))
    .map((item) => ({ id: item.id, name: item.label, owner: item.loginEmail }));
  const selectedAccountRows = [
    ...selectedAccounts.map((account) => ({ id: account.id, name: account.name, owner: account.owner })),
    ...selectedRemoteOnly,
  ];

  useEffect(() => {
    if (!backendDataLoaded || !open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingRemote(true);
      fetchClientAssignableAccounts(client.id, searchTerm)
        .then((result) => {
          if (!cancelled) setRemoteAccounts(result.items);
        })
        .catch((error) => {
          if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load assignable accounts.");
        })
        .finally(() => {
          if (!cancelled) setLoadingRemote(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [backendDataLoaded, client.id, client.accountIds, open, searchTerm]);

  const productionOptions = remoteAccounts.map((item) => {
    const existing = accounts.find((account) => account.id === item.id);
    return {
      id: item.id,
      name: item.label,
      owner: item.loginEmail,
      selected: item.selected,
      status: item.status,
      account: existing ?? null,
    };
  });

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearchTerm(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-11 w-full justify-between rounded-[14px] bg-white font-normal">
            <span className="truncate">{client.accountIds.length ? `${client.accountIds.length} account${client.accountIds.length > 1 ? "s" : ""} connected` : "Search and select accounts"}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-[#9995a7]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-[16px] border-[#e4e1ec] p-0 shadow-xl">
          <Command shouldFilter={!backendDataLoaded}>
            <CommandInput
              placeholder="Search by name or email…"
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {backendDataLoaded && loadingRemote && <div className="px-3 py-5 text-center text-sm text-muted-foreground">Searching accounts…</div>}
              {!loadingRemote && <CommandEmpty>No assignable account found.</CommandEmpty>}
              <CommandGroup heading={backendDataLoaded ? "Available or already connected" : "Kripicard accounts"}>
                {backendDataLoaded ? productionOptions.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.owner}`}
                    disabled={Boolean(assignmentPendingId)}
                    onSelect={() => void onToggle(client.id, item.id)}
                    className="items-start rounded-xl px-3 py-2.5"
                  >
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${item.selected ? "border-[#6157e7] bg-[#6157e7] text-white" : "border-[#d9d6e3]"}`}>
                      {item.selected && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.owner}</span>
                    </span>
                    <Badge variant="outline" className={`rounded-full text-[10px] ${item.selected ? "border-[#d8d3ff] bg-[#f0eeff] text-[#5549ca]" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                      {assignmentPendingId === item.id ? "Working…" : item.selected ? "Connected" : "Available"}
                    </Badge>
                  </CommandItem>
                )) : accounts.map((account) => {
                  const assignedClient = clients.find((item) => item.id !== client.id && item.accountIds.includes(account.id));
                  const selected = client.accountIds.includes(account.id);
                  return (
                    <CommandItem
                      key={account.id}
                      value={`${account.name} ${account.owner}`}
                      disabled={Boolean(assignedClient)}
                      onSelect={() => void onToggle(client.id, account.id)}
                      className="items-start rounded-xl px-3 py-2.5"
                    >
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${selected ? "border-[#6157e7] bg-[#6157e7] text-white" : "border-[#d9d6e3]"}`}>
                        {selected && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{account.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{assignedClient ? `Assigned to ${assignedClient.name}` : account.owner}</span>
                      </span>
                      <Badge variant="outline" className={`rounded-full text-[10px] ${assignedClient ? "border-slate-200 text-slate-500" : selected ? "border-[#d8d3ff] bg-[#f0eeff] text-[#5549ca]" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {assignedClient ? "In use" : selected ? "Selected" : "Available"}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {client.accountIds.length > 0 && (
        <div className="space-y-2">
          {selectedAccountRows.map((account) => (
            <div key={account.id} className="flex items-center justify-between rounded-[13px] border border-[#e8e5f0] bg-white px-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{account.name}</p><p className="truncate text-xs text-[#9692a3]">{account.owner}</p></div>
              <Button variant="ghost" size="sm" disabled={Boolean(assignmentPendingId)} className="rounded-xl text-[#b74250] hover:bg-red-50 hover:text-[#a82e3c]" onClick={() => void onToggle(client.id, account.id)}><XCircle className="size-4" />{assignmentPendingId === account.id ? "Disconnecting…" : "Disconnect"}</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={Boolean(assignmentPendingId)} className="w-full rounded-xl border-dashed text-[#7a7588]" onClick={() => void onDisconnectAll(client.id)}>Disconnect all accounts</Button>
        </div>
      )}
      {backendDataLoaded && <p className="text-xs leading-5 text-[#9692a3]">Search is server-side and returns only unassigned accounts plus accounts already connected to this client.</p>}
    </div>
  );
}

export default function DashboardApp() {
  const [view, setView] = useState<View>("overview");
  const [backendDataLoaded, setBackendDataLoaded] = useState(false);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [clients, setClients] = useState(initialClients);
  const [cards, setCards] = useState(initialCards);
  const [accountEmails, setAccountEmails] = useState(initialAccountEmails);
  const [fundingRequests, setFundingRequests] = useState(initialFundingRequests);
  const [cardRequests, setCardRequests] = useState(initialCardRequests);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [transactionNotificationIssues, setTransactionNotificationIssues] = useState<TransactionNotificationIssue[]>([]);
  const [messages, setMessages] = useState(initialMessages);
  const [supportConversations, setSupportConversations] = useState<SupportConversationSummary[]>([]);
  const [supportAttachment, setSupportAttachment] = useState<File | null>(null);
  const [operationalSnapshot, setOperationalSnapshot] = useState<OperationalSnapshot | null>(null);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeAccountEmailId, setActiveAccountEmailId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [liveCardDetails, setLiveCardDetails] = useState<LiveCardDetails | null>(null);
  const [activeCardTransactions, setActiveCardTransactions] = useState<StoredCardTransaction[]>([]);
  const [cardStatePendingId, setCardStatePendingId] = useState<string | null>(null);
  const [assignmentPendingId, setAssignmentPendingId] = useState<string | null>(null);
  const [fundingExecutionPendingId, setFundingExecutionPendingId] = useState<string | null>(null);
  const [emailActionPendingId, setEmailActionPendingId] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState("usr-amir");
  const [search, setSearch] = useState("");
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [createCardDialogOpen, setCreateCardDialogOpen] = useState(false);
  const [fundCardDialogOpen, setFundCardDialogOpen] = useState(false);
  const [fundCardId, setFundCardId] = useState<string | null>(null);
  const [fundCardScopeAccountId, setFundCardScopeAccountId] = useState<string | null>(null);
  const [fundCardAmount, setFundCardAmount] = useState(20);
  const [fundCardStage, setFundCardStage] = useState<CryptoPaymentStage>("form");
  const [fundCardNetwork, setFundCardNetwork] = useState("TRC20");
  const [fundCardPaymentId, setFundCardPaymentId] = useState("");
  const [fundCardRequestId, setFundCardRequestId] = useState<string | null>(null);
  const [createCardStage, setCreateCardStage] = useState<CryptoPaymentStage>("form");
  const [createCardNetwork, setCreateCardNetwork] = useState("TRC20");
  const [createCardPaymentId, setCreateCardPaymentId] = useState("");
  const [issuingRequestId, setIssuingRequestId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [serviceFee, setServiceFee] = useState(2.5);
  const [exchangeRate, setExchangeRate] = useState(2_212_000);
  const [maxCardsPerClient, setMaxCardsPerClient] = useState(3);
  const [minimumFunding, setMinimumFunding] = useState(20);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [accountForm, setAccountForm] = useState({ name: "", owner: "", mailbox: "", mailProvider: "Outlook / Hotmail" as Account["mailProvider"], password: "", apiKey: "" });
  const [cardForm, setCardForm] = useState({ bin: "539502", amount: 20, nameOnCard: "", email: "", dateOfBirth: "" });

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
          const mailbox = account.emailAccount?.emailAddress ?? account.loginEmail;
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
        // Keep unimplemented domains from showing stale demo records beside real DB records.
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
        console.warn("AccAbad backend snapshot unavailable; keeping local demo data.", error);
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
    if (!backendDataLoaded || view !== "requests") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([fetchCardRequests({ search, limit: 100 }), fetchFundingRequests({ search, limit: 100 })])
        .then(([cardResult, fundingResult]) => {
          if (cancelled) return;
          setCardRequests(cardResult.items.map(mapApiCardRequest));
          setFundingRequests(fundingResult.items.map(mapApiFundingRequest));
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
    fetchClientSupportMessages(activeChatId)
      .then((result) => {
        if (cancelled) return;
        const mapped: Message[] = result.items.map((item) => ({
          id: item.id,
          from: item.direction === "client_to_admin" ? "client" : "admin",
          body: item.text,
          time: new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          status: item.status,
          lastDeliveryError: item.lastDeliveryError,
          attachment: item.attachment ? { filename: item.attachment.filename, downloadUrl: item.attachment.downloadUrl, mimeType: item.attachment.mimeType } : null,
        }));
        setMessages((current) => ({ ...current, [activeChatId]: mapped }));
        void fetchSupportConversations().then((summary) => setSupportConversations(summary.items)).catch(() => {});
      })
      .catch(() => { if (!cancelled) setMessages((current) => ({ ...current, [activeChatId]: [] })); });
    return () => { cancelled = true; };
  }, [activeChatId, backendDataLoaded]);

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
    if (!backendDataLoaded || view !== "transactions") return;
    const timer = window.setTimeout(() => {
      Promise.all([
        fetchTransactions({ search: search.trim() || undefined, limit: 100 }),
        fetchTransactionNotificationIssues({ search: search.trim() || undefined, limit: 50 }),
      ]).then(([stored, issues]) => {
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
        setTransactionNotificationIssues(issues.items);
      }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load transactions."));
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
  const issuingRequest = cardRequests.find((request) => request.id === issuingRequestId) ?? null;
  const issuingRequestClient = clients.find((client) => client.id === issuingRequest?.clientId) ?? null;
  const eligibleCardAccounts = issuingRequestClient ? accounts.filter((account) => issuingRequestClient.accountIds.includes(account.id)) : accounts;
  const selectedCardAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedCardClient = clients.find((client) => client.accountIds.includes(selectedAccountId)) ?? null;
  const fundCard = cards.find((card) => card.id === fundCardId) ?? null;
  const fundCardChoices = fundCardScopeAccountId ? cards.filter((card) => card.accountId === fundCardScopeAccountId) : cards;
  const fundCardAccount = accounts.find((account) => account.id === fundCard?.accountId) ?? null;
  const fundCardClient = clients.find((client) => fundCard ? client.accountIds.includes(fundCard.accountId) : false) ?? null;
  const selectedBinRequiresDob = Boolean(binOptions.find((item) => item.value === cardForm.bin)?.requiresDob);
  const cardProviderFee = 1 + cardForm.amount * 0.04;
  const fundCardProviderFee = Number((1 + fundCardAmount * 0.04).toFixed(2));
  const fundCardCryptoTotal = Number((fundCardAmount + fundCardProviderFee).toFixed(2));
  const createCardCryptoTotal = Number(((cardForm.amount || 0) + cardProviderFee).toFixed(2));
  const cardTotal = accounts.reduce((sum, account) => sum + account.cardBalance, 0);
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
        const update: { label?: string; loginEmail?: string; password?: string; apiKey?: string; emailProvider?: "outlook" | "gmail"; emailAddress?: string } = {
          label: accountForm.name.trim(),
          loginEmail: accountForm.owner.trim(),
          emailProvider: accountForm.mailProvider === "Gmail" ? "gmail" : "outlook",
          emailAddress: (accountForm.mailbox.trim() || accountForm.owner.trim()),
        };
        if (accountForm.password.trim()) update.password = accountForm.password;
        if (accountForm.apiKey.trim()) update.apiKey = accountForm.apiKey;
        await updateAccount(editingAccountId, update);
        setAccounts((current) => current.map((account) => {
          if (account.id !== editingAccountId) return account;
          const nextMailbox = accountForm.mailbox.trim() || accountForm.owner.trim();
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
        const created = await createAccount({
          label: accountForm.name.trim(),
          loginEmail: accountForm.owner.trim(),
          password: accountForm.password,
          apiKey: accountForm.apiKey,
          emailProvider: accountForm.mailProvider === "Gmail" ? "gmail" : "outlook",
          emailAddress: (accountForm.mailbox.trim() || accountForm.owner.trim()),
        });
        setAccounts((current) => [...current, {
          id: created.id,
          name: accountForm.name.trim(),
          owner: accountForm.owner.trim(),
          mailbox: accountForm.mailbox.trim() || accountForm.owner.trim(),
          mailProvider: accountForm.mailProvider,
          password: "••••••••",
          keyHint: `••••••••${accountForm.apiKey.slice(-4)}`,
          accountBalance: null,
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

  const openCreateCard = (accountId = "") => {
    if (backendDataLoaded) {
      toast.info("Live card creation is only available through an approved card request in Request Center. Ad-hoc provider creation is intentionally disabled.");
      return;
    }
    setIssuingRequestId(null);
    setSelectedAccountId(accountId);
    setCardForm({ bin: "539502", amount: minimumFunding, nameOnCard: "", email: "", dateOfBirth: "" });
    setCreateCardStage("form");
    setCreateCardNetwork("TRC20");
    setCreateCardPaymentId("");
    setCreateCardDialogOpen(true);
  };

  const openFundCard = (cardId = "", accountId = "") => {
    if (backendDataLoaded) {
      toast.info("Production card funding runs only from an accepted funding request in Request Center. Ad-hoc provider funding is intentionally disabled.");
      return;
    }
    setFundCardId(cardId || null);
    setFundCardScopeAccountId(accountId || null);
    setFundCardAmount(minimumFunding);
    setFundCardStage("form");
    setFundCardNetwork("TRC20");
    setFundCardPaymentId("");
    setFundCardRequestId(null);
    setFundCardDialogOpen(true);
  };

  const beginFundCardPayment = () => {
    if (!fundCard || !fundCardAccount) {
      toast.error("Choose the card to fund.");
      return;
    }
    if (fundCardAmount < minimumFunding) {
      toast.error(`Your minimum card funding amount is ${formatUsd(minimumFunding)}.`);
      return;
    }
    setFundCardPaymentId(`CF-${Date.now().toString(36).toUpperCase()}`);
    setFundCardStage("payment");
    if (fundCardRequestId) {
      setFundingRequests((current) => current.map((item) => item.id === fundCardRequestId ? { ...item, status: "funding" } : item));
    }
    toast.success("Legacy prototype payment step opened. It does not call Kripicard; production funding is available only from an accepted request in Request Center.");
  };

  const confirmFundCard = () => {
    if (!fundCard || !fundCardAccount || fundCardStage !== "payment" || !fundCardPaymentId) return;
    setCards((current) => current.map((card) => card.id === fundCard.id ? { ...card, balance: card.balance + fundCardAmount } : card));
    setAccounts((current) => current.map((account) => account.id === fundCardAccount.id ? { ...account, cardBalance: account.cardBalance + fundCardAmount, lastSync: "Just now" } : account));
    setTransactions((current) => [{ id: `TX-${Date.now().toString().slice(-6)}`, clientId: fundCardClient?.id ?? null, accountId: fundCardAccount.id, cardLast4: fundCard.last4, merchant: "Legacy demo card funding", amount: fundCardAmount, type: "Funding", status: "Success", date: "Now" }, ...current]);
    if (fundCardRequestId) {
      setFundingRequests((current) => current.map((item) => item.id === fundCardRequestId ? { ...item, status: "completed" } : item));
    }
    if (fundCardClient) {
      setClients((current) => current.map((client) => client.id === fundCardClient.id ? { ...client, totalFunded: client.totalFunded + fundCardAmount } : client));
      setMessages((current) => ({
        ...current,
        [fundCardClient.id]: [...(current[fundCardClient.id] ?? []), { id: `m-${Date.now()}`, from: "admin", body: `${formatUsd(fundCardAmount)} was added to card •${fundCard.last4} in the legacy local prototype only.`, time: "Now" }],
      }));
    }
    setFundCardStage("completed");
    toast.success(`${formatUsd(fundCardAmount)} added to card •${fundCard.last4} in the legacy local prototype only.`);
  };

  const beginCreateCardPayment = () => {
    const account = accounts.find((item) => item.id === selectedAccountId);
    if (!account) { toast.error("Select the Kripicard account that will own this card."); return; }
    if (cardForm.nameOnCard.trim().length < 2) { toast.error("Name on card must contain at least 2 characters."); return; }
    if (cardForm.amount < minimumFunding) { toast.error(`Your minimum card funding amount is ${formatUsd(minimumFunding)}.`); return; }
    const selectedBin = binOptions.find((item) => item.value === cardForm.bin);
    if (selectedBin?.requiresDob && !cardForm.dateOfBirth) { toast.error(`Date of birth is required for BIN ${cardForm.bin}.`); return; }
    const assignedClient = clients.find((client) => client.accountIds.includes(account.id));
    if (issuingRequest && assignedClient?.id !== issuingRequest.clientId) { toast.error("Select an account currently assigned to the client who requested this card."); return; }
    if (assignedClient && cardsForClient(assignedClient).length >= maxCardsPerClient) { toast.error(`${assignedClient.name} has reached your ${maxCardsPerClient}-card platform limit.`); return; }
    setCreateCardPaymentId(`CC-${Date.now().toString(36).toUpperCase()}`);
    setCreateCardStage("payment");
    toast.success("Demo crypto payment instruction created. Confirm payment before issuing the card.");
  };

  const createCard = () => {
    const account = accounts.find((item) => item.id === selectedAccountId);
    if (!account) {
      toast.error("Select the Kripicard account that will issue this card.");
      return;
    }
    if (cardForm.nameOnCard.trim().length < 2) {
      toast.error("Name on card must contain at least 2 characters.");
      return;
    }
    if (cardForm.amount < minimumFunding) {
      toast.error(`Your minimum card funding amount is ${formatUsd(minimumFunding)}.`);
      return;
    }
    const selectedBin = binOptions.find((item) => item.value === cardForm.bin);
    if (selectedBin?.requiresDob && !cardForm.dateOfBirth) {
      toast.error(`Date of birth is required for BIN ${cardForm.bin}.`);
      return;
    }
    const assignedClient = clients.find((client) => client.accountIds.includes(account.id));
    if (issuingRequest && assignedClient?.id !== issuingRequest.clientId) {
      toast.error("Select an account currently assigned to the client who requested this card.");
      return;
    }
    if (assignedClient && cardsForClient(assignedClient).length >= maxCardsPerClient) {
      toast.error(`${assignedClient.name} has reached your ${maxCardsPerClient}-card platform limit.`);
      return;
    }
    if (createCardStage !== "payment" || !createCardPaymentId) {
      toast.error("Legacy prototype payment step must be completed before creating this local demo card.");
      return;
    }
    const stamp = Date.now();
    const cardId = `MR_${stamp.toString(36).toUpperCase()}`;
    const last4 = String(stamp).slice(-4);
    setAccounts((current) => current.map((item) => item.id === account.id ? {
      ...item,
      cardBalance: item.cardBalance + cardForm.amount,
      cards: item.cards + 1,
      lastSync: "Just now",
    } : item));
    setCards((current) => [...current, {
      id: cardId,
      accountId: account.id,
      bin: cardForm.bin,
      cardholder: cardForm.nameOnCard.trim(),
      email: cardForm.email.trim() || account.mailbox,
      last4,
      label: "Virtual card",
      balance: cardForm.amount,
      frozen: false,
      expiry: "Pending sync",
    }]);
    if (issuingRequestId) {
      setCardRequests((current) => current.map((request) => request.id === issuingRequestId ? { ...request, status: "Issued" } : request));
    }
    setCreateCardStage("completed");
    setCreateCardDialogOpen(false);
    setIssuingRequestId(null);
    toast.success(assignedClient ? `Legacy prototype card created for ${assignedClient.name} through ${account.name}.` : `Legacy prototype card created in ${account.name}; assign the account to show it in Telegram.`);
  };

  const removeAccount = () => {
    if (!deleteAccountId) return;
    if (backendDataLoaded) {
      toast.info("Account archive/delete is not enabled yet; production records are preserved.");
      setDeleteAccountId(null);
      return;
    }
    const connectedUsers = clients.filter((client) => client.accountIds.includes(deleteAccountId)).length;
    if (connectedUsers) {
      toast.error(`Reassign ${connectedUsers} connected client${connectedUsers > 1 ? "s" : ""} before deleting this account.`);
      setDeleteAccountId(null);
      return;
    }
    setAccounts((current) => current.filter((account) => account.id !== deleteAccountId));
    setCards((current) => current.filter((card) => card.accountId !== deleteAccountId));
    setAccountEmails((current) => current.filter((email) => email.accountId !== deleteAccountId));
    setDeleteAccountId(null);
    toast.success("Account deleted.");
  };

  const openAccountEmail = (emailId: string) => {
    setActiveAccountEmailId(emailId);
    setAccountEmails((current) => current.map((email) => email.id === emailId ? { ...email, unread: false } : email));
  };

  const toggleBan = (clientId: string) => {
    if (backendDataLoaded) {
      toast.info("Client moderation writes are not enabled yet.");
      return;
    }
    setClients((current) => current.map((client) => client.id === clientId ? { ...client, banned: !client.banned } : client));
    const target = clients.find((client) => client.id === clientId);
    toast.success(target?.banned ? "Client unbanned." : "Client banned from the bot.");
  };

  const toggleCard = async (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!backendDataLoaded) {
      setCards((current) => current.map((item) => item.id === cardId ? { ...item, frozen: !item.frozen } : item));
      toast.success("Demo card status updated.");
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
        toast.error("Freeze/unfreeze is installed but disabled. Enable the Phase 6 provider-write flags in deployment configuration after testing.");
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

  const advanceRequest = async (request: FundingRequest) => {
    if (request.status !== "pending_review") return;
    if (!backendDataLoaded) {
      setFundingRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "accepted" } : item));
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
      setFundingRequests((current) => current.map((item) => item.id === activeRequest.id ? { ...item, status: "rejected" } : item));
      setRejectDialogOpen(false); setRejectNote(""); return;
    }
    try {
      await reviewFundingRequest(activeRequest.id, { action: "reject", note: rejectNote.trim() || null });
      await reloadFundingRequests();
      setRejectDialogOpen(false);
      setRejectNote("");
      toast.success("Request rejected and queued for Telegram notification.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Funding request rejection failed."); }
  };


  const executeAcceptedFunding = async (request: FundingRequest, mode: "fund" | "reconcile") => {
    if (!backendDataLoaded || fundingExecutionPendingId) return;
    setFundingExecutionPendingId(request.id);
    try {
      const result = mode === "fund" ? await executeFundingRequest(request.id) : await reconcileFundingRequest(request.id);
      await reloadFundingRequests();
      if (result.status === "completed") {
        toast.success(result.reconciled ? "Funding was reconciled and marked completed." : "Kripicard funded the card and the request is complete.");
      } else {
        const delta = result.evidence?.balanceDeltaUsdCents;
        toast.warning(`Funding remains unresolved. AccAbad will not retry fundcard automatically${delta != null ? `; observed balance delta: $${(Number(delta) / 100).toFixed(2)}` : ""}. Confirm the outcome with Kripicard before resolving.`);
      }
    } catch (error) {
      try { await reloadFundingRequests(); } catch { /* keep original error */ }
      if (error instanceof AdminApiError && error.code === "feature_disabled") {
        toast.error("Card funding is installed but disabled. Enable both provider-write and Phase 16 funding switches after staging validation.");
      } else {
        toast.error(error instanceof Error ? error.message : "Card funding action failed.");
      }
    } finally {
      setFundingExecutionPendingId(null);
    }
  };

  const resolveFundingOutcome = async (request: FundingRequest, outcome: "completed" | "not_funded") => {
    if (!backendDataLoaded || fundingExecutionPendingId) return;
    const providerReference = window.prompt("Enter the Kripicard support/ticket/reference that confirms this outcome:");
    if (!providerReference?.trim()) return;
    const note = window.prompt(outcome === "completed" ? "Optional resolution note:" : "Optional note explaining why it is safe to retry:") ?? "";
    setFundingExecutionPendingId(request.id);
    try {
      const result = await resolveFundingRequest(request.id, { outcome, providerReference: providerReference.trim(), note: note.trim() || null });
      await reloadFundingRequests();
      toast.success(result.status === "completed" ? "Funding marked completed from provider-confirmed reconciliation." : "Provider confirmed the card was not funded. The request is now safe for an explicit retry.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve funding reconciliation.");
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
      setMessages((current) => ({ ...current, [activeChatId]: [...(current[activeChatId] ?? []), { id: `m-${Date.now()}`, from: "admin", body, time: "Now", attachment: supportAttachment ? { filename: supportAttachment.name } : null }] }));
      setChatDraft("");
      setSupportAttachment(null);
      toast.success("Demo message queued for Telegram.");
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

  const toggleClientAccount = async (clientId: string, accountId: string) => {
    if (assignmentPendingId) return;
    const target = clients.find((client) => client.id === clientId);
    if (!target) return;
    const removing = target.accountIds.includes(accountId);

    if (!backendDataLoaded) {
      const assignedClient = clients.find((client) => client.id !== clientId && client.accountIds.includes(accountId));
      if (assignedClient) {
        toast.error(`This account is already assigned to ${assignedClient.name}.`);
        return;
      }
      setClients((current) => current.map((client) => client.id === clientId ? {
        ...client,
        accountIds: removing ? client.accountIds.filter((id) => id !== accountId) : [...client.accountIds, accountId],
      } : client));
      toast.success(removing ? "Demo account disconnected." : "Demo account connected.");
      return;
    }

    setAssignmentPendingId(accountId);
    try {
      const result = removing
        ? await unassignClientAccount(clientId, accountId)
        : await assignClientAccount(clientId, accountId);
      setClients((current) => current.map((client) => client.id === clientId ? { ...client, accountIds: result.accountIds } : client));
      toast.success(removing
        ? "Account disconnected. Its cards are no longer visible on the client's next bot action."
        : "Account connected. Its cards are available on the client's next bot action.");
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "account_already_assigned") {
        toast.error("Another operator assigned this account first. The account was not reassigned.");
      } else if (error instanceof AdminApiError && error.code === "assignment_changed") {
        toast.error("The assignment changed in another session. Reopen the client to refresh it.");
      } else {
        toast.error(error instanceof Error ? error.message : "Account assignment failed.");
      }
    } finally {
      setAssignmentPendingId(null);
    }
  };

  const disconnectAllClientAccounts = async (clientId: string) => {
    if (assignmentPendingId) return;
    if (!backendDataLoaded) {
      setClients((current) => current.map((client) => client.id === clientId ? { ...client, accountIds: [] } : client));
      toast.success("All demo accounts disconnected.");
      return;
    }
    setAssignmentPendingId(`all:${clientId}`);
    try {
      const result = await unassignAllClientAccounts(clientId);
      setClients((current) => current.map((client) => client.id === clientId ? { ...client, accountIds: result.accountIds } : client));
      toast.success(result.removedCount
        ? `Disconnected ${result.removedCount} account${result.removedCount === 1 ? "" : "s"}. The client now sees only Contact the admin.`
        : "This client already has no connected accounts.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect the client's accounts.");
    } finally {
      setAssignmentPendingId(null);
    }
  };

  const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? "Not connected";
  const clientName = (id: string | null) => id ? clients.find((client) => client.id === id)?.name ?? "Unknown client" : "No Telegram user";
  const pendingRequestCount =
    cardRequests.filter((r) => r.status === "New").length +
    fundingRequests.filter((r) => r.status === "pending_review" || r.status === "needs_reconciliation").length;
  const unreadInboxCount = supportConversations.reduce((sum, c) => sum + (c.unreadAdminCount ?? 0), 0);
  const badgeFor = (view: View): number => (view === "requests" ? pendingRequestCount : view === "inbox" ? unreadInboxCount : 0);

  useEffect(() => {
    const valid: View[] = ["overview", "accounts", "clients", "kyc", "requests", "transactions", "inbox", "operations", "settings"];
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
              <Overview
                accounts={accounts}
                clients={clients}
                requests={fundingRequests}
                cardTotal={cardTotal}
                telegramStatus={telegramStatus}
                onViewChange={changeView}
                onOpenRequest={setActiveRequestId}
                clientName={clientName}
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
                maxCardsPerClient={maxCardsPerClient}
                onOpen={setActiveClientId}
                onToggleBan={toggleBan}
                accountName={accountName}
              />
            )}
            {view === "kyc" && <KycView />}
            {view === "requests" && (
              <RequestsView
                fundingRequests={fundingRequests}
                cardRequests={cardRequests}
                clients={clients}
                cards={cards}
                clientName={clientName}
                maxCardsPerClient={maxCardsPerClient}
                search={search}
                onOpenRequest={setActiveRequestId}
                onCardRequestAction={async (id, action, selectedAccountId) => {
                  try {
                    const updated = await reviewCardRequest(id, { action, selectedAccountId: selectedAccountId || null });
                    setCardRequests((current) => current.map((item) => item.id === id ? mapApiCardRequest(updated) : item));
                    toast.success(action === "approve" ? "Card request approved. Use Issue card after recent reauthentication when provider writes are enabled." : "Card request rejected.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Card request review failed.");
                  }
                }}
                onCardRequestIssue={async (id, mode) => {
                  try {
                    const result = mode === "issue" ? await issueCardRequest(id) : await reconcileCardRequest(id);
                    const refreshed = await fetchCardRequests({ limit: 100 });
                    setCardRequests(refreshed.items.map(mapApiCardRequest));
                    if (result.status === "issued") toast.success(result.reconciled ? "Card issuance reconciled and marked issued." : "Kripicard card created and request marked issued.");
                    else toast.warning("Provider outcome is still uncertain. AccAbad will not retry createcard; reconcile again or contact Kripicard support.");
                  } catch (error) {
                    try {
                      const refreshed = await fetchCardRequests({ limit: 100 });
                      setCardRequests(refreshed.items.map(mapApiCardRequest));
                    } catch {
                      // Preserve the original issuance error; request state will refresh on the next normal load.
                    }
                    toast.error(error instanceof Error ? error.message : "Card issuance action failed.");
                  }
                }}
              />
            )}
            {view === "transactions" && (
              <TransactionsView transactions={transactions} clientName={clientName} search={search} issues={transactionNotificationIssues} onReconcileIssue={reconcileNotificationIssue} />
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
              />
            )}
            {view === "settings" && (
              <SettingsView
                serviceFee={serviceFee}
                exchangeRate={exchangeRate}
                maxCardsPerClient={maxCardsPerClient}
                minimumFunding={minimumFunding}
                botToken={botToken}
                showToken={showToken}
                telegramStatus={telegramStatus}
                channels={channels}
                newChannel={newChannel}
                onServiceFee={setServiceFee}
                onExchangeRate={setExchangeRate}
                onMaxCardsPerClient={setMaxCardsPerClient}
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
              <Label htmlFor="account-owner">Account email</Label>
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
              <Label htmlFor="account-mailbox">Connected inbox address</Label>
              <Input id="account-mailbox" type="email" value={accountForm.mailbox} onChange={(event) => setAccountForm((current) => ({ ...current, mailbox: event.target.value }))} placeholder="e.g. account-name@outlook.com" />
              <p className="text-xs leading-5 text-[#8f8b9c]">Use a mailbox you control from Outlook/Hotmail or Gmail. If left blank, AccAbad uses the account email above. Inbox access will use the provider&apos;s OAuth API.</p>
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

      <Dialog open={createCardDialogOpen} onOpenChange={(open) => { setCreateCardDialogOpen(open); if (!open) { setIssuingRequestId(null); setCreateCardStage("form"); setCreateCardPaymentId(""); } }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{issuingRequestId ? `Issue card request ${issuingRequestId}` : "Create a virtual card"}</DialogTitle>
            <DialogDescription>Choose the owning Kripicard account and card details. The admin must complete a crypto payment before the demo issues the card.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="grid gap-2">
              <Label>Issuing account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select a Kripicard account" /></SelectTrigger>
                <SelectContent>
                  {eligibleCardAccounts.map((account) => {
                    const assignedClient = clients.find((client) => client.accountIds.includes(account.id));
                    return <SelectItem key={account.id} value={account.id}>{account.name} · {assignedClient?.name ?? "Unassigned"}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {issuingRequestClient && !eligibleCardAccounts.length && <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="text-amber-700" /><AlertTitle>No account assigned</AlertTitle><AlertDescription>Connect a Kripicard account to {issuingRequestClient.name} before issuing this requested card.</AlertDescription></Alert>}
              {selectedCardAccount && <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#e9e6f0] bg-[#faf9fc] px-3.5 py-3 text-sm"><span><strong>Account balance is informational only</strong></span><span className="text-[#777287]">{selectedCardClient ? `Card will appear for ${selectedCardClient.name}` : "No Telegram client assigned"}</span></div>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Card BIN</Label><Select value={cardForm.bin} onValueChange={(value) => setCardForm((current) => ({ ...current, bin: value }))}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{binOptions.map((bin) => <SelectItem key={bin.value} value={bin.value}>{bin.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label htmlFor="card-amount">Initial balance (USD)</Label><Input id="card-amount" type="number" min={minimumFunding} step="1" value={cardForm.amount} onChange={(event) => setCardForm((current) => ({ ...current, amount: Number(event.target.value) }))} /><p className="text-xs text-[#8f8b9c]">Your configured minimum is {formatUsd(minimumFunding)}.</p></div>
              <div className="grid gap-2"><Label htmlFor="card-name">Name on card</Label><Input id="card-name" value={cardForm.nameOnCard} onChange={(event) => setCardForm((current) => ({ ...current, nameOnCard: event.target.value }))} placeholder="At least 2 characters" /></div>
              <div className="grid gap-2"><Label htmlFor="card-email">Cardholder email <span className="font-normal text-[#9692a3]">· optional</span></Label><Input id="card-email" type="email" value={cardForm.email} onChange={(event) => setCardForm((current) => ({ ...current, email: event.target.value }))} placeholder={selectedCardAccount?.mailbox ?? "Defaults to connected inbox"} /></div>
              {selectedBinRequiresDob && <div className="grid gap-2 sm:col-span-2"><Label htmlFor="card-dob">Date of birth</Label><Input id="card-dob" type="date" value={cardForm.dateOfBirth} onChange={(event) => setCardForm((current) => ({ ...current, dateOfBirth: event.target.value }))} /><p className="text-xs text-[#8f8b9c]">Required by the selected US, Singapore, or UK card product.</p></div>}
            </div>

            <div className="rounded-[18px] border border-[#ddd9f5] bg-[#f3f1ff] p-4">
              <div className="flex items-center justify-between text-sm"><span className="text-[#625c86]">Initial card balance</span><strong>{formatUsd(cardForm.amount || 0)}</strong></div>
              <div className="mt-2 flex items-center justify-between text-sm"><span className="text-[#625c86]">Demo provider fee · $1 + 4%</span><strong>{formatUsd(cardProviderFee)}</strong></div>
              <div className="mt-3 flex items-center justify-between border-t border-[#d9d4f0] pt-3"><span className="font-semibold text-[#302b68]">Legacy demo total</span><strong className="text-lg text-[#302b68]">{formatUsd(createCardCryptoTotal)}</strong></div>
              <p className="mt-2 text-xs leading-5 text-[#777287]">Demo uses USDT ≈ USD for the payment preview. Production must display the exact amount/address returned by the approved provider or payment service.</p>
            </div>
              {selectedCardClient && cardsForClient(selectedCardClient).length >= maxCardsPerClient && <Alert className="border-red-200 bg-red-50"><AlertTriangle className="text-red-700" /><AlertTitle>Client card limit reached</AlertTitle><AlertDescription>{selectedCardClient.name} already has {cardsForClient(selectedCardClient).length} cards. Raise your platform limit or use another client account.</AlertDescription></Alert>}
              {createCardStage === "payment" && <div className="space-y-3 rounded-[18px] border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-amber-700">Demo payment</p><p className="mt-1 font-mono text-sm font-semibold">{createCardPaymentId}</p></div><Badge variant="outline" className="border-amber-300 bg-white text-amber-800">Awaiting admin payment</Badge></div><div className="grid gap-2 sm:grid-cols-2"><div><Label>Asset</Label><Input value="USDT" readOnly className="mt-1 bg-white" /></div><div><Label>Network</Label><Select value={createCardNetwork} onValueChange={setCreateCardNetwork}><SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TRC20">TRC20</SelectItem><SelectItem value="BEP20">BEP20</SelectItem><SelectItem value="ERC20">ERC20</SelectItem></SelectContent></Select></div></div><div className="rounded-xl border border-amber-200 bg-white p-3"><p className="text-xs text-[#8f8b9c]">Pay exactly (demo)</p><p className="mt-1 text-xl font-semibold">{createCardCryptoTotal.toFixed(2)} USDT</p><p className="mt-2 break-all font-mono text-xs text-[#7c6c58]">DEMO_ONLY_NO_REAL_PAYMENT_ADDRESS</p></div><p className="text-xs font-medium text-red-700">Do not send real cryptocurrency to this demo address.</p></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setCreateCardDialogOpen(false); setIssuingRequestId(null); }}>Cancel</Button>
            {createCardStage === "form" ? <Button onClick={beginCreateCardPayment} disabled={!selectedAccountId || !cardForm.nameOnCard.trim()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><WalletCards className="size-4" />Continue legacy demo</Button> : <Button onClick={createCard} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><RefreshCw className="size-4" />Complete legacy demo</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fundCardDialogOpen} onOpenChange={(open) => { setFundCardDialogOpen(open); if (!open) { setFundCardId(null); setFundCardScopeAccountId(null); setFundCardStage("form"); setFundCardPaymentId(""); setFundCardRequestId(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[580px]">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2"><Badge className="rounded-full bg-[#6157e7] text-white">Legacy prototype</Badge><Badge variant="outline" className="rounded-full">Not a production provider flow</Badge></div>
            <DialogTitle>{fundCardRequestId ? `Legacy fund demo ${fundCardRequestId}` : "Legacy local funding demo"}</DialogTitle>
            <DialogDescription>This local fallback is retained only for prototype rendering. It never calls Kripicard; production Phase 16 funding is executed only from an accepted request in Request Center.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2"><Label>Card</Label><Select value={fundCardId ?? ""} onValueChange={(value) => { setFundCardId(value); setFundCardStage("form"); setFundCardPaymentId(""); }}><SelectTrigger className="h-11"><SelectValue placeholder="Select a card" /></SelectTrigger><SelectContent>{fundCardChoices.map((card) => { const account = accounts.find((item) => item.id === card.accountId); return <SelectItem key={card.id} value={card.id}>•{card.last4} · {card.label} · {account?.name}</SelectItem>; })}</SelectContent></Select></div>
            {fundCard && fundCardAccount ? <>
              <div className="grid grid-cols-2 gap-3"><div className="rounded-[16px] border border-[#eceaf2] bg-[#faf9fc] p-4"><p className="text-xs text-[#9692a3]">Card receives</p><p className="mt-1 text-lg font-semibold">{formatUsd(fundCardAmount || 0)}</p><p className="mt-1 text-xs text-[#9692a3]">Current: {formatUsd(fundCard.balance)}</p></div><div className="rounded-[16px] border border-[#eceaf2] bg-[#faf9fc] p-4"><p className="text-xs text-[#9692a3]">Owning account</p><p className="mt-1 truncate text-sm font-semibold">{fundCardAccount.name}</p><p className="mt-1 text-xs text-[#9692a3]">Legacy prototype only</p></div></div>
              <div className="grid gap-2"><Label htmlFor="fund-card-amount">Amount to add (USD)</Label><Input id="fund-card-amount" type="number" min={minimumFunding} step="1" value={fundCardAmount} onChange={(event) => { setFundCardAmount(Number(event.target.value)); setFundCardStage("form"); setFundCardPaymentId(""); }} /><p className="text-xs text-[#8f8b9c]">Configured minimum: {formatUsd(minimumFunding)}.</p></div>
              <div className="rounded-[18px] border border-[#d9d4f0] bg-[#f3f1ff] p-4 text-sm"><div className="flex justify-between"><span className="text-[#625c86]">Card credit</span><strong>{formatUsd(fundCardAmount || 0)}</strong></div><div className="mt-2 flex justify-between"><span className="text-[#625c86]">Demo provider fee · $1 + 4%</span><strong>{formatUsd(fundCardProviderFee)}</strong></div><div className="mt-3 flex justify-between border-t border-[#d9d4f0] pt-3"><span className="font-semibold text-[#302b68]">Legacy demo total</span><strong className="text-lg text-[#302b68]">{formatUsd(fundCardCryptoTotal)}</strong></div></div>
              {fundCardStage === "payment" && <div className="space-y-3 rounded-[18px] border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-amber-700">Demo payment</p><p className="mt-1 font-mono text-sm font-semibold">{fundCardPaymentId}</p></div><Badge variant="outline" className="border-amber-300 bg-white text-amber-800">Awaiting admin payment</Badge></div><div><Label>Network</Label><Select value={fundCardNetwork} onValueChange={setFundCardNetwork}><SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TRC20">USDT · TRC20</SelectItem><SelectItem value="BEP20">USDT · BEP20</SelectItem><SelectItem value="ERC20">USDT · ERC20</SelectItem></SelectContent></Select></div><div className="rounded-xl border border-amber-200 bg-white p-3"><p className="text-xs text-[#8f8b9c]">Pay exactly (demo)</p><p className="mt-1 text-xl font-semibold">{fundCardCryptoTotal.toFixed(2)} USDT</p><p className="mt-2 break-all font-mono text-xs text-[#7c6c58]">DEMO_ONLY_NO_REAL_PAYMENT_ADDRESS</p></div><p className="text-xs font-medium text-red-700">Do not send real cryptocurrency to this demo address.</p></div>}
            </> : <div className="rounded-[18px] border border-dashed border-[#d9d5e4] bg-[#faf9fc] p-6 text-center"><CreditCard className="mx-auto size-7 text-[#aaa6b8]" /><p className="mt-2 text-sm font-semibold text-[#49455a]">Choose a card only when exercising the legacy local prototype.</p></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setFundCardDialogOpen(false)}>{fundCardStage === "completed" ? "Done" : "Cancel"}</Button>
            {fundCardStage === "form" && <Button disabled={!fundCard || !fundCardAccount || fundCardAmount < minimumFunding} onClick={beginFundCardPayment} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><WalletCards className="size-4" />Continue legacy demo</Button>}
            {fundCardStage === "payment" && <Button onClick={confirmFundCard} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><RefreshCw className="size-4" />Complete legacy demo</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteAccountId)} onOpenChange={(open) => !open && setDeleteAccountId(null)}>
        <AlertDialogContent className="rounded-[24px] border-[#e5e2ee] shadow-[0_28px_80px_rgba(26,24,48,.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account connection?</AlertDialogTitle>
            <AlertDialogDescription>This removes the saved API connection. It does not delete cards at Kripicard.</AlertDialogDescription>
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
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#efedf3] pt-3"><div><p className="text-xs text-[#9692a3]">Card balance</p><p className="font-semibold">{formatUsd(card.balance)}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={backendDataLoaded} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => openFundCard(card.id)}><CircleDollarSign className="size-4" />{backendDataLoaded ? "Funding disabled" : "Add funds"}</Button><Button variant="outline" size="sm" className="rounded-xl" disabled={cardStatePendingId === card.id} onClick={() => void toggleCard(card.id)}>{card.frozen ? <Unlock className="size-4" /> : <Snowflake className="size-4" />}{card.frozen ? "Unfreeze" : "Freeze"}</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setLiveCardDetails(null); setActiveCardId(card.id); }}><Eye className="size-4" />Details</Button></div></div>
                      </div>
                    ))}
                    {!activeAccountCardMatches.length && <div className="rounded-[18px] border border-dashed bg-white p-8 text-center"><CreditCard className="mx-auto size-7 text-[#c1bdcc]" /><p className="mt-2 text-sm font-medium">{search ? "No matching cards" : "No cards in this account"}</p>{!search && <Button size="sm" className="mt-4 rounded-xl bg-[#6157e7] text-white" onClick={() => openCreateCard(activeAccount.id)}><Plus className="size-4" />Create card (legacy demo)</Button>}</div>}
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
              <SheetFooter className="flex-wrap border-t border-[#eceaf2] bg-white px-6 py-4"><Button variant="outline" onClick={() => openEditAccount(activeAccount)} className="rounded-xl"><PencilLine className="size-4" />Edit connection</Button><Button disabled={backendDataLoaded || !activeAccountCards.length} onClick={() => openFundCard("", activeAccount.id)} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]"><CircleDollarSign className="size-4" />{backendDataLoaded ? "Provider funding disabled" : "Add funds"}</Button><Button variant="ghost" onClick={() => openCreateCard(activeAccount.id)} className="rounded-xl text-[#6157e7]"><Plus className="size-4" />Create card (legacy demo)</Button></SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(activeAccountEmailId)} onOpenChange={(open) => !open && setActiveAccountEmailId(null)}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[620px]">
          {activeAccountEmail && <><DialogHeader><div className="flex items-center gap-2"><Badge variant="outline" className="rounded-full">{activeAccountEmail.category}</Badge>{activeAccountEmail.cardLast4 && <Badge variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">Card •{activeAccountEmail.cardLast4}</Badge>}</div><DialogTitle className="pt-2">{activeAccountEmail.subject}</DialogTitle><DialogDescription>From {activeAccountEmail.sender} · received {activeAccountEmail.received}</DialogDescription></DialogHeader><div className="rounded-[18px] border border-[#e8e6ef] bg-[#faf9fc] p-5 text-sm leading-7 text-[#494558]">{activeAccountEmail.body}</div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setActiveAccountEmailId(null)}>Close</Button>{activeAccountEmail.category === "3DS" && <Button disabled={!activeAccountClient} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => toast.success(`Code queued for ${activeAccountClient?.name}.`)}><Send className="size-4" />{activeAccountClient ? `Send to ${activeAccountClient.name}` : "No user assigned"}</Button>}</DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeCardId)} onOpenChange={(open) => { if (!open) { setActiveCardId(null); setLiveCardDetails(null); } }}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)] sm:max-w-[580px]">
          {activeCard && <><DialogHeader><DialogTitle>{activeCard.label} · •{activeCard.last4}</DialogTitle><DialogDescription>Live card details are retrieved from the Kripicard account that owns this card.</DialogDescription></DialogHeader><dl className="grid gap-3 rounded-[18px] border border-[#e8e6ef] bg-[#faf9fc] p-5 text-sm sm:grid-cols-2"><div><dt className="text-[#9692a3]">Card ID</dt><dd className="mt-1 font-mono font-semibold">{activeCard.providerCardId ?? activeCard.id}</dd></div><div><dt className="text-[#9692a3]">BIN / last four</dt><dd className="mt-1 font-semibold">{activeCard.bin} · •{activeCard.last4}</dd></div><div><dt className="text-[#9692a3]">Cardholder</dt><dd className="mt-1 font-semibold">{activeCard.cardholder}</dd></div><div><dt className="text-[#9692a3]">Expiry</dt><dd className="mt-1 font-semibold">{activeCard.expiry}</dd></div><div><dt className="text-[#9692a3]">Balance</dt><dd className="mt-1 font-semibold">{formatUsd(activeCard.balance)}</dd></div><div><dt className="text-[#9692a3]">Status</dt><dd className="mt-1 font-semibold">{activeCard.frozen ? "Frozen" : "Active"}</dd></div><div className="sm:col-span-2"><dt className="text-[#9692a3]">3DS delivery address</dt><dd className="mt-1 break-all font-semibold">{activeCard.email}</dd></div></dl>{liveCardDetails && <div className="grid gap-3 rounded-[18px] border border-amber-200 bg-amber-50 p-5 text-sm sm:grid-cols-3"><div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">Live card number</p><p className="mt-1 break-all font-mono text-base font-bold text-amber-950">{liveCardDetails.cardNumber}</p></div><div><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">CVV</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{liveCardDetails.cvv}</p></div><div><p className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">Expiry</p><p className="mt-1 font-semibold text-amber-950">{liveCardDetails.expiry}</p></div><div className="sm:col-span-2"><p className="text-xs text-amber-700">Sensitive details auto-hide after 30 seconds and are not written to the AccAbad database.</p></div></div>}{backendDataLoaded && <div className="rounded-[18px] border border-[#e8e6ef] bg-white p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-[#353146]">Stored provider transactions</p><p className="text-xs text-[#9692a3]">Synced from Kripicard and deduplicated in PostgreSQL.</p></div><Badge variant="outline" className="rounded-full">{activeCardTransactions.length}</Badge></div><div className="max-h-52 space-y-2 overflow-y-auto">{activeCardTransactions.slice(0, 20).map((tx) => <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0eef4] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{tx.merchant || tx.type || "Provider transaction"}</p><p className="text-xs text-[#9692a3]">{new Date(tx.occurredAt).toLocaleString()} · {tx.type || "Unknown"} · {tx.status}</p></div><span className="shrink-0 text-sm font-semibold">{formatUsd(Number(tx.amountMinor) / 100)}</span></div>)}{activeCardTransactions.length === 0 && <p className="rounded-xl border border-dashed p-3 text-center text-sm text-[#9692a3]">No synchronized transactions yet. Use Sync transactions.</p>}</div></div>}<Alert className="border-[#ddd9f5] bg-[#f3f1ff]"><ShieldCheck className="text-[#6157e7]" /><AlertTitle>Protected card data</AlertTitle><AlertDescription>AccAbad fetches PAN, expiry, and CVV from Kripicard only after an explicit, reauthenticated reveal. They are never persisted to PostgreSQL and are cleared from this view automatically.</AlertDescription></Alert><DialogFooter><Button disabled={backendDataLoaded} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => { const cardId = activeCard.id; setActiveCardId(null); openFundCard(cardId); }}><CircleDollarSign className="size-4" />{backendDataLoaded ? "Funding disabled" : "Add funds"}</Button><Button variant="outline" className="rounded-xl" disabled={cardStatePendingId === activeCard.id} onClick={() => void toggleCard(activeCard.id)}>{activeCard.frozen ? <Unlock className="size-4" /> : <Snowflake className="size-4" />}{cardStatePendingId === activeCard.id ? "Working…" : activeCard.frozen ? "Unfreeze" : "Freeze"}</Button><Button variant="outline" className="rounded-xl" disabled={cardStatePendingId === activeCard.id} onClick={() => void refreshProviderCardStatus(activeCard)}><RefreshCw className="size-4" />Refresh status</Button><Button variant="outline" className="rounded-xl" onClick={() => void revealProviderCardDetails(activeCard)}><Eye className="size-4" />Reveal number & CVV</Button><Button variant="outline" className="rounded-xl" onClick={() => void syncProviderCardTransactions(activeCard)}><ArrowLeftRight className="size-4" />Sync transactions</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(activeClientId)} onOpenChange={(open) => !open && setActiveClientId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#e7e4ed] bg-[#fbfafc] sm:max-w-xl">
          {activeClient && (
            <>
              <SheetHeader className="border-b border-[#eceaf2] bg-white px-6 py-5">
                <div className="flex items-center gap-3 pr-8">
                  <Avatar className="size-11"><AvatarFallback className="bg-[#eeecff] font-bold text-[#5b50d6]">{initials(activeClient.name)}</AvatarFallback></Avatar>
                  <div>
                    <SheetTitle className="text-lg">{activeClient.name}</SheetTitle>
                    <SheetDescription>{activeClient.username} · Telegram {activeClient.telegramId}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-6 px-6 py-5">
                <div className="grid gap-2">
                  <Label>Connected Kripicard accounts</Label>
                  <AccountAssignmentPicker accounts={accounts} clients={clients} client={activeClient} backendDataLoaded={backendDataLoaded} assignmentPendingId={assignmentPendingId} onToggle={toggleClientAccount} onDisconnectAll={disconnectAllClientAccounts} />
                  {!activeClient.accountIds.length && <p className="text-sm text-amber-700">The bot only shows “Contact the admin” until an account is assigned.</p>}
                  <p className="text-xs leading-5 text-[#9692a3]">A Kripicard account can belong to one Telegram client only. This client may have multiple accounts.</p>
                </div>
                <div className="rounded-[18px] border border-[#e7e3f1] bg-[#f7f5ff] p-4">
                  <div><p className="font-semibold text-[#302d43]">Platform card policy</p><p className="mt-1 text-sm leading-5 text-[#777287]">This is your own client limit and has no connection to Kripicard verification.</p></div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#e4e0ef] pt-3 text-sm">
                    <span className="text-[#777287]">Card allowance</span>
                    <Badge variant="outline" className={activeClientCards.length >= maxCardsPerClient ? "border-red-200 bg-red-50 text-red-700" : "border-[#d9d5ff] bg-white text-[#5549ca]"}>{activeClientCards.length} of {maxCardsPerClient} cards</Badge>
                  </div>
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
                  ) : <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">{activeClient.accountIds.length ? "No cards exist in the connected accounts." : "No account connected. The bot shows only Contact the admin."}</div>}
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
                  <button disabled={!backendDataLoaded || !activeRequest.receiptScanStatus || activeRequest.receiptScanStatus !== "clean"} onClick={() => backendDataLoaded && window.open(fundingReceiptDownloadUrl(activeRequest.id), "_blank", "noopener,noreferrer")} className="flex w-full items-center gap-3 rounded-[18px] border border-[#e8e6ef] bg-white p-4 text-left transition hover:border-[#d7d2f5] hover:bg-[#f8f6ff] disabled:cursor-not-allowed disabled:opacity-60">
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
                    {activeRequest.status === "pending_review" ? <><Button variant="outline" className="rounded-xl" onClick={() => void requestFundingCorrection()}>Request correction</Button><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => void advanceRequest(activeRequest)}>Accept payment<ChevronRight className="size-4" /></Button></> : activeRequest.status === "accepted" || activeRequest.status === "funding_failed" ? <Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void executeAcceptedFunding(activeRequest, "fund")}><WalletCards className="size-4" />{fundingExecutionPendingId === activeRequest.id ? "Working…" : activeRequest.status === "funding_failed" ? "Retry safe failure" : "Fund card"}</Button> : activeRequest.status === "needs_reconciliation" ? <><Button variant="outline" className="rounded-xl border-amber-300 bg-amber-50 text-amber-900" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void executeAcceptedFunding(activeRequest, "reconcile")}><RefreshCw className="size-4" />Recheck provider state</Button><Button variant="outline" className="rounded-xl" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void resolveFundingOutcome(activeRequest, "not_funded")}>Provider confirms not funded</Button><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void resolveFundingOutcome(activeRequest, "completed")}>Provider confirms funded</Button></> : activeRequest.status === "funding" ? <Button variant="outline" className="rounded-xl" disabled={fundingExecutionPendingId === activeRequest.id} onClick={() => void executeAcceptedFunding(activeRequest, "reconcile")}><RefreshCw className={`size-4 ${fundingExecutionPendingId === activeRequest.id ? "animate-spin" : ""}`} />{fundingExecutionPendingId === activeRequest.id ? "Checking…" : "Recheck if stuck"}</Button> : null}
                  </>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-[24px] border-[#e5e2ee] p-7 shadow-[0_28px_80px_rgba(26,24,48,.18)]">
          <DialogHeader><DialogTitle>Reject funding request?</DialogTitle><DialogDescription>The request will stop and the client will be notified in Telegram.</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="reject-note">Message to client</Label><Textarea id="reject-note" value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Explain what needs to be corrected, if anything." /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={rejectRequest}>Reject and notify</Button></DialogFooter>
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
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<ApiKycSubmission | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchKycSubmissions({ status: filter, search: search || undefined, limit: 50 }, controller.signal)
      .then((res) => setItems(res.items))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error(error instanceof AdminApiError ? error.message : "Could not load KYC submissions.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filter, search, tick]);

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      await reviewKycSubmission(selected.id, { decision, note: note.trim() || null });
      toast.success(decision === "approve" ? "Customer approved." : "Customer rejected.");
      setSelected(null);
      setNote("");
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
        action={<Button variant="outline" className="rounded-xl" onClick={() => setTick((t) => t + 1)}><RefreshCw className="size-4" />Refresh</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button key={f.id} variant={filter === f.id ? "default" : "outline"} className="rounded-full" onClick={() => setFilter(f.id)}>{f.label}</Button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9d99aa]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, phone…" className="h-11 rounded-[14px] border-[#e5e3ec] bg-white pl-10 shadow-sm" />
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
                  <Badge variant="outline" className={`shrink-0 rounded-full ${badgeClass(item.status)}`}>{item.status}</Badge>
                </button>
              ))
            )}
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
                  <KycDetailField label="Telegram" value={selected.customer.username ? `@${selected.customer.username}` : selected.customer.displayName ?? `ID ${selected.customer.telegramUserId}`} />
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9692a3]">ID document</p>
                  {selected.hasDocument ? (
                    selected.documentMimeType?.startsWith("image/") ? (
                      <img src={kycDocumentUrl(selected.id)} alt="KYC document" className="max-h-72 w-full rounded-[16px] border border-[#ece9f2] object-contain" />
                    ) : (
                      <a href={kycDocumentUrl(selected.id)} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><FileText className="size-4" />Open document</Button></a>
                    )
                  ) : (
                    <p className="text-sm text-[#9692a3]">No document attached.</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="kyc-note">Review note (optional)</Label>
                  <Textarea id="kyc-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the record…" className="mt-1 min-h-20 rounded-[14px]" />
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`rounded-full ${badgeClass(selected.status)}`}>{selected.status}</Badge>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => decide("reject")}><XCircle className="size-4" />Reject</Button>
                    <Button className="rounded-xl" disabled={busy} onClick={() => decide("approve")}><Check className="size-4" />Approve</Button>
                  </div>
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

function Overview({
  accounts,
  clients,
  requests,
  cardTotal,
  telegramStatus,
  onViewChange,
  onOpenRequest,
  clientName,
}: {
  accounts: Account[];
  clients: Client[];
  requests: FundingRequest[];
  cardTotal: number;
  telegramStatus: TelegramBotStatus | null;
  onViewChange: (view: View) => void;
  onOpenRequest: (id: string) => void;
  clientName: (id: string) => string;
}) {
  const open = requests.filter((request) => !["completed", "rejected", "cancelled"].includes(request.status));
  const cardCount = accounts.reduce((sum, account) => sum + account.cards, 0);
  const queuedAmount = open.reduce((sum, request) => sum + request.amount, 0);
  const maxCardBalance = Math.max(1, ...accounts.map((account) => account.cardBalance));
  const botLive = Boolean(telegramStatus?.configured && telegramStatus.webhook?.url);
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#8179e8]">Friday · September 4</p>
          <h2 className="mt-2 text-[30px] font-bold tracking-[-.045em] text-[#1b1930] sm:text-[34px]">Good morning, Admin</h2>
          <p className="mt-1 text-[15px] text-[#7e7a8e]">Here’s what needs your attention across card operations.</p>
        </div>
        <Button className="h-11 rounded-[14px] bg-[#6157e7] px-4 text-white shadow-[0_8px_22px_rgba(97,87,231,.2)] hover:bg-[#554bcf]" onClick={() => onViewChange("requests")}>
          Review {open.length} requests <ChevronRight className="size-4" />
        </Button>
      </div>

      <section className="hero-grid relative overflow-hidden rounded-[30px] p-6 text-white shadow-[0_24px_60px_rgba(31,27,63,.16)] sm:p-8">
        <div className="relative grid gap-8 xl:grid-cols-[1.25fr_.75fr] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#c7c2e6]"><span className="grid size-7 place-items-center rounded-lg bg-white/10"><CreditCard className="size-3.5" /></span>Card balances under management</div>
            <p className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{formatUsd(cardTotal)}</p>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[#aaa5c8]">Across {accounts.length} connected Kripicard accounts. Kripicard&apos;s documented production flow is wallet-based; card creation and funding stay disabled until the later payment phases implement that provider workflow safely.</p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <button onClick={() => onViewChange("accounts")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#282347] transition hover:bg-[#f0edff]">Manage accounts</button>
              <button onClick={() => onViewChange("transactions")} className="rounded-xl border border-white/15 bg-white/[.06] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">View transactions</button>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[.07] p-5 backdrop-blur-md">
            <div className="flex items-end justify-between"><div><p className="text-sm text-[#b7b2d0]">Account distribution</p><p className="mt-1 text-2xl font-semibold">{accounts.length} accounts</p></div><p className="text-sm font-medium text-[#c6ffdc]">{cardCount} cards</p></div>
            <div className="mt-5 space-y-3.5">
              {accounts.map((account, index) => (
                <div key={account.id}>
                  <div className="mb-1.5 flex justify-between text-xs"><span className="text-[#d5d1e7]">{account.name}</span><span className="font-medium text-white">{formatUsd(account.cardBalance)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${index === 0 ? "bg-[#8d84ff]" : index === 1 ? "bg-[#55d5a8]" : "bg-[#ffc568]"}`} style={{ width: `${Math.max(12, (account.cardBalance / maxCardBalance) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="surface-card mt-4 grid overflow-hidden rounded-[22px] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Connected accounts" value={`${accounts.length}`} detail={`${cardCount} cards in total`} />
        <SummaryStat label="Funding queued" value={formatUsd(queuedAmount)} detail={`${open.length} open requests`} />
        <SummaryStat label="Telegram clients" value={`${clients.length}`} detail={`${clients.filter((client) => !client.accountIds.length).length} need an account`} />
        <SummaryStat label="Bot connection" value={botLive ? "Live" : "Not live"} detail={botLive ? `@${telegramStatus?.bot?.username ?? "bot"} webhook connected` : "Webhook setup required"} alert={!botLive} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.75fr]">
        <Card className="surface-card data-table overflow-hidden rounded-[24px]">
          <CardHeader className="flex-row items-center justify-between space-y-0 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
            <div><CardTitle className="text-[17px] tracking-[-.02em] text-[#242139]">Funding queue</CardTitle><p className="mt-1 text-sm text-[#8a8698]">Verify payments, then move them to card funding.</p></div>
            <Button variant="ghost" size="sm" className="rounded-xl text-[#6157e7] hover:bg-[#efedff] hover:text-[#5146ca]" onClick={() => onViewChange("requests")}>View all <ChevronRight className="size-4" /></Button>
          </CardHeader>
          <CardContent className="px-0 pb-1">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Request</TableHead><TableHead>Client</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                <TableBody>
                  {requests.slice(0, 4).map((request) => (
                    <TableRow key={request.id} className="cursor-pointer" onClick={() => onOpenRequest(request.id)}>
                      <TableCell className="pl-6 font-semibold text-[#312d45]">{request.id}<span className="mt-0.5 block text-xs font-normal text-[#9d99aa]">Card •{request.cardLast4}</span></TableCell>
                      <TableCell className="text-[#49455a]">{clientName(request.clientId)}</TableCell>
                      <TableCell className="font-semibold text-[#312d45]">{formatUsd(request.amount)}</TableCell>
                      <TableCell><StatusBadge status={request.status} /></TableCell>
                      <TableCell><span className="grid size-8 place-items-center rounded-lg bg-[#f4f2fa] text-[#777287]"><ChevronRight className="size-4" /></span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card rounded-[24px]">
          <CardHeader className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6"><div className="flex items-start justify-between"><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#242139]">Today’s focus</CardTitle><p className="mt-1 text-sm text-[#8a8698]">The fastest path to a clear queue.</p></div><span className="grid size-9 place-items-center rounded-xl bg-[#eeecff] text-[#6157e7]"><CheckCircle2 className="size-4" /></span></div></CardHeader>
          <CardContent className="space-y-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
            <FocusRow number="1" title="Review receipts" detail={`${requests.filter((request) => request.status === "pending_review").length} awaiting verification`} onClick={() => onViewChange("requests")} />
            <FocusRow number="2" title="Fund approved cards" detail={`${requests.filter((request) => ["accepted", "funding"].includes(request.status)).length} ready or in progress`} onClick={() => onViewChange("requests")} />
            <FocusRow number="3" title={botLive ? "Review Telegram" : "Connect Telegram"} detail={botLive ? "Webhook is connected" : "Webhook setup required"} onClick={() => onViewChange("settings")} warning={!botLive} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-7 flex items-center justify-between"><div><h3 className="text-[17px] font-semibold tracking-[-.02em] text-[#242139]">Connected accounts</h3><p className="mt-1 text-sm text-[#8a8698]">Provider health and card balances.</p></div><Button variant="ghost" size="sm" className="rounded-xl text-[#6157e7]" onClick={() => onViewChange("accounts")}>Manage <ChevronRight className="size-4" /></Button></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {accounts.map((account, index) => (
          <button key={account.id} onClick={() => onViewChange("accounts")} className="surface-card flex items-center gap-4 rounded-[20px] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#d9d5ef] hover:shadow-[0_16px_36px_rgba(26,24,48,.075)]">
            <span className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${index === 0 ? "bg-[#eeecff] text-[#6157e7]" : index === 1 ? "bg-[#e6f8f1] text-[#16815e]" : "bg-[#fff3df] text-[#b66e10]"}`}><Landmark className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#302d43]">{account.name}</span><span className="mt-1 block text-xs text-[#9692a3]">{account.cards} cards · synced {account.lastSync}</span></span>
            <span className="text-right"><span className="block text-xs text-[#9692a3]">Account {formatOptionalUsd(account.accountBalance)}</span><span className="mt-0.5 block text-sm font-semibold text-[#302d43]">Cards {formatUsd(account.cardBalance)}</span><span className={`mt-1 inline-flex items-center gap-1 text-xs ${account.status === "Connected" ? "text-[#16815e]" : "text-[#b66e10]"}`}><span className={`size-1.5 rounded-full ${account.status === "Connected" ? "bg-[#22a77a]" : "bg-[#f2a33a]"}`} />{account.status}</span></span>
          </button>
        ))}
      </div>
    </>
  );
}

function SummaryStat({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className="border-b border-[#eeecf3] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="flex items-center gap-2"><p className="text-xs font-medium text-[#8b8798]">{label}</p>{alert && <span className="size-1.5 rounded-full bg-[#f2a33a]" />}</div><p className="mt-1.5 text-xl font-semibold tracking-[-.025em] text-[#242139]">{value}</p><p className="mt-1 text-xs text-[#a09cad]">{detail}</p></div>;
}

function FocusRow({ number, title, detail, onClick, warning = false }: { number: string; title: string; detail: string; onClick: () => void; warning?: boolean }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-[16px] border border-[#eeecf3] bg-[#fbfafc] p-3.5 text-left transition hover:border-[#dcd8f1] hover:bg-[#f7f5ff]"><span className={`grid size-8 shrink-0 place-items-center rounded-[10px] text-xs font-bold ${warning ? "bg-[#fff0da] text-[#ad6811]" : "bg-[#eeecff] text-[#5b50d6]"}`}>{number}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#353146]">{title}</span><span className="mt-0.5 block text-xs text-[#9692a3]">{detail}</span></span><ChevronRight className="size-4 text-[#aaa6b8]" /></button>;
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
  return (
    <>
      <PageIntro title="Account connections" description="Credentials, visible account balances, external inboxes, and exclusive client assignments. Production card funding is executed only from accepted funding requests." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onAdd} className="h-11 rounded-[14px] bg-white"><Plus className="size-4" />Add account</Button><Button variant="outline" onClick={() => onCreateCard()} className="h-11 rounded-[14px] bg-white"><CreditCard className="size-4" />Create card (legacy demo)</Button><Button onClick={() => onFundCard()} className="h-11 rounded-[14px] bg-[#6157e7] px-4 text-white shadow-[0_8px_22px_rgba(97,87,231,.18)] hover:bg-[#554bcf]"><CircleDollarSign className="size-4" />Add funds (legacy demo)</Button></div>} />
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
                <div className="mt-5 grid grid-cols-3 gap-2.5"><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">Cards</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{accountCards.length}</p></div><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">Account balance</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{formatOptionalUsd(account.accountBalance)}</p></div><div className="rounded-[15px] bg-[#f8f7fb] p-3.5"><p className="text-xs text-[#9692a3]">On cards</p><p className="mt-1.5 font-semibold tracking-[-.02em] text-[#302d43]">{formatUsd(account.cardBalance)}</p></div></div>
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
                <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="h-10 rounded-[13px] bg-white" onClick={() => onOpen(account.id)}><Eye className="size-4" />Open account</Button><Button variant="outline" className="h-10 rounded-[13px] bg-white" disabled={!accountCards.length} onClick={() => onFundCard(undefined, account.id)}><WalletCards className="size-4" />Fund a card</Button><Button variant="ghost" className="col-span-2 h-9 rounded-[12px] text-[#6157e7]" onClick={() => onCreateCard(account.id)}><Plus className="size-4" />Create another card</Button></div>
                <div className="mt-4 flex items-center justify-between border-t border-[#eeecf3] pt-4"><p className="text-xs text-[#aaa6b8]">Synced {account.lastSync}</p><div className="flex gap-1"><Button variant="ghost" size="icon" className="rounded-xl text-[#777287] hover:bg-[#f2f0fa]" onClick={() => void onSync(account)}><RefreshCw className="size-4" /><span className="sr-only">Sync</span></Button><Button variant="ghost" size="icon" className="rounded-xl text-[#777287] hover:bg-[#f2f0fa]" onClick={() => onEdit(account)}><PencilLine className="size-4" /><span className="sr-only">Edit</span></Button><Button variant="ghost" size="icon" className="rounded-xl text-[#c24755] hover:bg-[#fff0f2]" onClick={() => onDelete(account.id)}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button></div></div>
              </CardContent>
            </Card>
          );
        })}
        {!accounts.length && <div className="col-span-full rounded-2xl border border-dashed bg-white p-12 text-center"><Landmark className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-medium">No matching accounts</p><p className="mt-1 text-sm text-slate-500">Try another search or add a new connection.</p></div>}
      </div>
      <div className="mt-4 overflow-hidden rounded-[20px] border border-[#e8e6ef] bg-white"><ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} /></div>
      <Alert className="mt-5 rounded-[20px] border-[#ddd9f5] bg-[#f3f1ff]"><ShieldCheck className="text-[#6157e7]" /><AlertTitle className="text-[#302b68]">Account ownership controls bot access</AlertTitle><AlertDescription className="text-[#625c86]">Cards always remain inside their Kripicard account. Telegram clients only inherit cards from currently assigned accounts; disconnecting the final account immediately returns that client to the Contact admin state.</AlertDescription></Alert>
    </>
  );
}

function ClientsView({ clients, cards, maxCardsPerClient, onOpen, onToggleBan, accountName }: { clients: Client[]; cards: ClientCard[]; maxCardsPerClient: number; onOpen: (id: string) => void; onToggleBan: (id: string) => void; accountName: (id: string | null) => string }) {
  const paging = usePaginatedItems(clients);
  return (
    <>
      <PageIntro title="Clients" description="Telegram access, card limits, and multiple exclusive Kripicard account connections." />
      <Card className="data-table overflow-hidden surface-card rounded-[24px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Client</TableHead><TableHead>Connected accounts</TableHead><TableHead>Cards / limit</TableHead><TableHead>Total funded</TableHead><TableHead>Bot access</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
            <TableBody>
              {paging.pageItems.map((client) => {
                const accessibleCards = cards.filter((card) => client.accountIds.includes(card.accountId));
                return <TableRow key={client.id}>
                  <TableCell className="pl-6"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(client.name)}</AvatarFallback></Avatar><div><button onClick={() => onOpen(client.id)} className="font-semibold text-[#353146] hover:text-[#6157e7]">{client.name}</button><p className="mt-0.5 text-xs text-[#9692a3]">{client.username} · {client.telegramId}</p></div></div></TableCell>
                  <TableCell>{client.accountIds.length ? <div className="flex max-w-[280px] flex-wrap gap-1.5">{client.accountIds.map((id) => <Badge key={id} variant="outline" className="rounded-full border-[#d8d3ff] bg-[#f2f0ff] text-[#5549ca]">{accountName(id)}</Badge>)}</div> : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Contact admin</Badge>}</TableCell>
                  <TableCell><span className="font-semibold">{accessibleCards.length}</span><span className="mt-1 block text-xs text-[#9692a3]">{Math.max(maxCardsPerClient - accessibleCards.length, 0)} remaining</span></TableCell><TableCell className="font-medium">{formatUsd(client.totalFunded)}</TableCell>
                  <TableCell><Badge variant="outline" className={client.banned ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{client.banned ? "Banned" : "Active"}</Badge></TableCell>
                  <TableCell><div className="flex items-center justify-end gap-3"><Button variant="ghost" size="sm" onClick={() => onOpen(client.id)}>View</Button><Switch checked={!client.banned} onCheckedChange={() => onToggleBan(client.id)} aria-label={`${client.banned ? "Unban" : "Ban"} ${client.name}`} /></div></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
        <ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} />
      </Card>
      <div className="mt-4 flex items-center gap-2 rounded-[16px] border border-[#e8e5f6] bg-[#f5f3ff] px-4 py-3 text-sm text-[#6a6488]"><ShieldCheck className="size-4 text-[#6157e7]" />The card cap is your platform policy and applies across all accounts connected to a client. Registration verification is a separate workflow and is never sent to Kripicard.</div>
    </>
  );
}

function RequestsView({ fundingRequests, cardRequests, clients, cards, clientName, maxCardsPerClient, search, onOpenRequest, onCardRequestAction, onCardRequestIssue }: { fundingRequests: FundingRequest[]; cardRequests: CardRequest[]; clients: Client[]; cards: ClientCard[]; clientName: (id: string | null) => string; maxCardsPerClient: number; search: string; onOpenRequest: (id: string) => void; onCardRequestAction: (id: string, action: "approve" | "reject", selectedAccountId?: string | null) => void | Promise<void>; onCardRequestIssue: (id: string, mode: "issue" | "reconcile") => void | Promise<void> }) {
  const needle = search.trim().toLowerCase();
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const matchingFundingRequests = fundingRequests.filter((request) => !needle || `${request.id} ${clientName(request.clientId)} ${request.cardLast4} ${request.receipt} ${request.receiptType} ${fundingMeta[request.status].label}`.toLowerCase().includes(needle));
  const matchingCardRequests = cardRequests.filter((request) => !needle || `${request.reference} ${clientName(request.clientId)} ${request.nameOnCard} ${request.email} ${request.bin} ${request.status}`.toLowerCase().includes(needle));
  const fundingPaging = usePaginatedItems(matchingFundingRequests);
  const cardPaging = usePaginatedItems(matchingCardRequests);

  async function review(request: CardRequest, action: "approve" | "reject") {
    const selectedAccountId = request.selectedAccountId || selectedAccounts[request.id] || "";
    if (action === "approve" && !selectedAccountId) {
      toast.error("Select one of the client's currently assigned Kripicard accounts first.");
      return;
    }
    setPendingRequestId(request.id);
    try {
      await onCardRequestAction(request.id, action, selectedAccountId || null);
    } finally {
      setPendingRequestId(null);
    }
  }

  async function issue(request: CardRequest, mode: "issue" | "reconcile") {
    setPendingRequestId(request.id);
    try {
      await onCardRequestIssue(request.id, mode);
    } finally {
      setPendingRequestId(null);
    }
  }

  return (
    <>
      <PageIntro title="Request center" description="Review requests, issue approved cards, and execute accepted funding through guarded one-shot Kripicard workflows." />
      <Tabs defaultValue="cards">
        <TabsList className="mb-4 h-11 rounded-[14px] border border-[#e7e5ef] bg-white p-1 shadow-[0_4px_18px_rgba(26,24,48,.04)]">
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="cards">New cards <Badge variant="outline" className="ml-1.5 rounded-full">{cardRequests.filter((item) => item.status === "New").length}</Badge></TabsTrigger>
          <TabsTrigger className="rounded-[10px] px-4 data-[state=active]:bg-[#eeecff] data-[state=active]:text-[#5146ca]" value="funding">Funding <Badge className="ml-1.5 rounded-full bg-[#6157e7] text-white">{fundingRequests.filter((item) => !["completed", "rejected", "cancelled"].includes(item.status)).length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="cards">
          <Card className="data-table overflow-hidden surface-card rounded-[24px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Request</TableHead><TableHead>Client</TableHead><TableHead>Cardholder</TableHead><TableHead>BIN</TableHead><TableHead>Initial funds</TableHead><TableHead>Issuing account</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {cardPaging.pageItems.map((request) => {
                    const client = clients.find((item) => item.id === request.clientId);
                    const clientCardCount = client ? cards.filter((card) => client.accountIds.includes(card.accountId)).length : 0;
                    const limitReached = clientCardCount >= maxCardsPerClient;
                    const selectedAccountId = request.selectedAccountId || selectedAccounts[request.id] || "";
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="pl-6 font-semibold text-[#353146]">{request.reference}<span className="mt-0.5 block text-xs font-normal text-[#9692a3]">{request.submitted}</span></TableCell>
                        <TableCell>{clientName(request.clientId)}{!request.eligibleAccounts.length && <span className="block text-xs text-[#b66e10]">Needs assigned account</span>}{limitReached && <span className="block text-xs text-[#b53847]">Current cards at platform limit</span>}</TableCell>
                        <TableCell><span className="font-medium">{request.nameOnCard}</span><span className="block max-w-[190px] truncate text-xs text-[#9692a3]">{request.email}{request.dateOfBirth ? ` · DOB ${request.dateOfBirth}` : ""}</span></TableCell>
                        <TableCell className="font-mono text-sm">{request.bin}</TableCell>
                        <TableCell className="font-semibold">{formatUsd(request.initialAmount)}</TableCell>
                        <TableCell className="min-w-[190px]">
                          {request.status === "New" ? (
                            <Select value={selectedAccountId} onValueChange={(value) => setSelectedAccounts((current) => ({ ...current, [request.id]: value }))}>
                              <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Select account" /></SelectTrigger>
                              <SelectContent>{request.eligibleAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label}<span className="ml-1 text-xs text-muted-foreground">· {account.loginEmail}</span></SelectItem>)}</SelectContent>
                            </Select>
                          ) : request.selectedAccountId ? (
                            <span className="text-sm">{request.eligibleAccounts.find((item) => item.id === request.selectedAccountId)?.label ?? "Selected account"}</span>
                          ) : <span className="text-sm text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className={`${request.status === "New" ? "border-[#f4d9aa] bg-[#fff5e4] text-[#a4600c]" : request.status === "Issued" ? "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]" : request.status === "Rejected" || request.status === "Cancelled" ? "border-[#f1c7cc] bg-[#fff0f2] text-[#b53847]" : "border-[#d9d5ff] bg-[#f0eeff] text-[#5449c8]"} rounded-full`}>{request.status}</Badge>{request.adminNote && <span className="mt-1 block max-w-[180px] truncate text-xs text-muted-foreground">{request.adminNote}</span>}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {request.status === "New" && <>
                              <Button size="sm" variant="outline" disabled={pendingRequestId === request.id} className="rounded-xl" onClick={() => void review(request, "reject")}>Reject</Button>
                              <Button size="sm" disabled={pendingRequestId === request.id || limitReached || !request.eligibleAccounts.length || !selectedAccountId} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => void review(request, "approve")}>Approve</Button>
                            </>}
                            {request.status === "Approved" && <Button size="sm" disabled={pendingRequestId === request.id} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" onClick={() => void issue(request, "issue")}>Issue card</Button>}
                            {request.status === "Issue failed" && <Button size="sm" variant="outline" disabled={pendingRequestId === request.id} className="rounded-xl" onClick={() => void issue(request, "issue")}>Retry clean failure</Button>}
                            {request.status === "Needs reconciliation" && <Button size="sm" variant="outline" disabled={pendingRequestId === request.id} className="rounded-xl border-amber-300 bg-amber-50 text-amber-900" onClick={() => void issue(request, "reconcile")}>Reconcile</Button>}
                            {request.status === "Issuing" && <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-800">Provider operation in progress</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!cardPaging.pageItems.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No card requests match the current search.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <ListPagination page={cardPaging.page} pageSize={cardPaging.pageSize} totalItems={cardPaging.totalItems} totalPages={cardPaging.totalPages} onPageChange={cardPaging.setPage} />
          </Card>
          <Alert className="mt-4 rounded-2xl border-indigo-200 bg-indigo-50/60"><ShieldCheck className="text-indigo-700" /><AlertTitle className="text-indigo-950">Transactional platform limit</AlertTitle><AlertDescription className="text-indigo-900/70">Submission is enforced by PostgreSQL using current cards plus open requests across all assigned accounts. Approval rechecks the limit and requires an account that is still assigned to the client. Approval alone does not call Kripicard. The explicit Issue card action requires recent admin reauthentication and deployment kill switches, calls createcard once, and never auto-retries an uncertain provider outcome.</AlertDescription></Alert>
        </TabsContent>
        <TabsContent value="funding">
          <Card className="data-table overflow-hidden surface-card rounded-[24px]">
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Request</TableHead><TableHead>Client</TableHead><TableHead>Card</TableHead><TableHead>Receipt</TableHead><TableHead>Client pays</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{fundingPaging.pageItems.map((request) => <TableRow key={request.id} className="cursor-pointer" onClick={() => onOpenRequest(request.id)}><TableCell className="pl-6 font-semibold text-[#353146]">{request.id}<span className="mt-0.5 block text-xs font-normal text-[#9692a3]">{request.submitted}</span></TableCell><TableCell>{clientName(request.clientId)}</TableCell><TableCell><span className="font-semibold">{formatUsd(request.amount)}</span><span className="block text-xs text-[#9d99aa]">to •{request.cardLast4}</span></TableCell><TableCell><span className="inline-flex items-center gap-2 text-sm"><ReceiptIcon type={request.receiptType} />{request.receiptType.toUpperCase()}</span></TableCell><TableCell className="font-medium">{formatRial(request.rialTotal)}</TableCell><TableCell><StatusBadge status={request.status} /></TableCell><TableCell><span className="grid size-8 place-items-center rounded-lg bg-[#f4f2fa]"><ChevronRight className="size-4 text-[#777287]" /></span></TableCell></TableRow>)}</TableBody></Table></div>
            <ListPagination page={fundingPaging.page} pageSize={fundingPaging.pageSize} totalItems={fundingPaging.totalItems} totalPages={fundingPaging.totalPages} onPageChange={fundingPaging.setPage} />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function TransactionsView({ transactions, clientName, search, issues, onReconcileIssue }: { transactions: Transaction[]; clientName: (id: string | null) => string; search: string; issues: TransactionNotificationIssue[]; onReconcileIssue: (id: string, action: "acknowledge" | "retry") => void | Promise<void> }) {
  const needle = search.trim().toLowerCase();
  const matchingTransactions = transactions.filter((transaction) => !needle || `${transaction.id} ${clientName(transaction.clientId)} ${transaction.accountId} ${transaction.cardLast4} ${transaction.merchant} ${transaction.type} ${transaction.status}`.toLowerCase().includes(needle));
  const paging = usePaginatedItems(matchingTransactions);
  return (
    <>
      <PageIntro title="Card transactions" description="Scheduled Kripicard activity with fingerprint deduplication and current-owner Telegram notifications." action={<Button variant="outline" className="h-11 rounded-[14px] border-[#dedbe8] bg-white" onClick={() => toast.info("Phase 17 scheduled sync runs through the protected Kripicard transaction job. Manual per-card sync remains available from card details.")}><RefreshCw className="size-4" />Sync status</Button>} />
      {issues.length > 0 && <Card className="mb-4 surface-card rounded-[22px] border-amber-200 bg-amber-50/40"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Notification reconciliation</CardTitle><p className="mt-1 text-sm text-[#777287]">Failed deliveries can be safely retried only while the original user still owns the account. Ownership-change skips are never resent automatically.</p></div><Badge variant="outline" className="rounded-full border-amber-300 bg-white text-amber-800">{issues.length} issue{issues.length === 1 ? "" : "s"}</Badge></div></CardHeader><CardContent className="space-y-2">{issues.slice(0, 8).map((issue) => <div key={issue.id} className="flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">•{issue.last4 ?? "????"} · {issue.merchant || issue.transactionType || "Provider transaction"}</p><p className="mt-1 text-xs text-[#8f8b9c]">{issue.notificationStatus} · {issue.notificationError || "delivery mismatch"} · {new Date(issue.occurredAt).toLocaleString()}</p></div><div className="flex gap-2">{issue.notificationStatus === "failed" && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void onReconcileIssue(issue.id, "retry")}>Retry safely</Button>}<Button size="sm" variant="outline" className="rounded-xl" onClick={() => void onReconcileIssue(issue.id, "acknowledge")}>Acknowledge</Button></div></div>)}</CardContent></Card>}
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><MetricCard icon={CheckCircle2} label="Successful volume" value={formatUsd(338.99)} foot="Across the visible period" tone="cyan" /><MetricCard icon={XCircle} label="Declined" value={formatUsd(9.99)} foot="Insufficient balance" tone="amber" /><MetricCard icon={ShieldCheck} label="Verification events" value="1" foot="OTP event — no code exposed" tone="violet" /></div>
      <Card className="data-table overflow-hidden surface-card rounded-[24px]"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#faf9fc]"><TableHead className="pl-6">Transaction</TableHead><TableHead>Client</TableHead><TableHead>Merchant</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Telegram</TableHead></TableRow></TableHeader><TableBody>{paging.pageItems.map((tx) => <TableRow key={tx.id}><TableCell className="pl-6"><span className="font-semibold text-[#353146]">{tx.id}</span><span className="mt-0.5 block text-xs text-[#9692a3]">{tx.date}</span></TableCell><TableCell>{clientName(tx.clientId)}<span className="block text-xs text-[#9d99aa]">card •{tx.cardLast4}</span></TableCell><TableCell className="font-semibold text-[#353146]">{tx.merchant}</TableCell><TableCell>{tx.type}</TableCell><TableCell className="font-semibold text-[#353146]">{formatUsd(tx.amount)}</TableCell><TableCell><Badge variant="outline" className={`${tx.status === "Success" ? "border-[#bfe9d9] bg-[#eaf8f2] text-[#167957]" : "border-[#f1c7cc] bg-[#fff0f2] text-[#b53847]"} rounded-full`}>{tx.status}</Badge></TableCell><TableCell><Badge variant="outline" className="rounded-full">{tx.notificationStatus ?? "demo"}</Badge></TableCell></TableRow>)}</TableBody></Table></div><ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} /></Card>
    </>
  );
}

function InboxView({ clients, activeClient, activeClientId, messages, draft, search, conversations, attachment, onAttachment, onDraftChange, onSelect, onSend, onConversationAction, onRetry }: { clients: Client[]; activeClient: Client; activeClientId: string; messages: Message[]; draft: string; search: string; conversations: SupportConversationSummary[]; attachment: File | null; onAttachment: (file: File | null) => void; onDraftChange: (value: string) => void; onSelect: (id: string) => void; onSend: () => void; onConversationAction: (action: "open" | "pending" | "closed" | "assign_me") => void | Promise<void>; onRetry: (messageId: string) => void | Promise<void> }) {
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
  const needle = search.trim().toLowerCase();
  const summaryByUser = new Map(conversations.map((item) => [item.userId, item]));
  const matchingClients = clients.filter((client) => {
    const summary = summaryByUser.get(client.id);
    const preview = summary?.lastMessage?.text ?? messagesForPreview(client.id);
    return !needle || `${client.name} ${client.username} ${client.telegramId} ${preview}`.toLowerCase().includes(needle);
  }).sort((a, b) => (summaryByUser.get(b.id)?.unreadAdminCount ?? 0) - (summaryByUser.get(a.id)?.unreadAdminCount ?? 0));
  const paging = usePaginatedItems(matchingClients);
  const activeConversation = summaryByUser.get(activeClientId);
  return (
    <>
      <PageIntro title="Telegram inbox" description="Persistent support conversations with private attachments, unread state, delivery tracking, and durable Telegram retries." />
      <Card className="grid min-h-[650px] overflow-hidden surface-card rounded-[26px] lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-[#e9e7f0] bg-[#f8f7fb] lg:border-b-0 lg:border-r">
          <div className="border-b border-[#e9e7f0] p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#9692a3]">Conversations</p><p className="mt-1 text-sm text-[#777287]">Unread conversations are prioritized automatically.</p></div>
          <div className="p-2.5">{paging.pageItems.map((client) => { const summary = summaryByUser.get(client.id); const preview = summary?.lastMessage?.text || messagesForPreview(client.id); return <button key={client.id} onClick={() => onSelect(client.id)} className={`flex w-full items-center gap-3 rounded-[16px] p-3 text-left transition ${activeClientId === client.id ? "bg-white shadow-[0_6px_20px_rgba(26,24,48,.06)] ring-1 ring-[#e2dff1]" : "hover:bg-white/70"}`}><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(client.name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center justify-between"><span className="font-semibold text-[#353146]">{client.name}</span><span className="text-xs text-[#aaa6b8]">{summary?.lastMessageAt ? new Date(summary.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></span><span className="mt-0.5 block truncate text-sm text-[#8c8899]">{preview}</span></span>{Boolean(summary?.unreadAdminCount) && <span className="min-w-5 rounded-full bg-[#6157e7] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{summary?.unreadAdminCount}</span>}</button>; })}</div>
          <ListPagination page={paging.page} pageSize={paging.pageSize} totalItems={paging.totalItems} totalPages={paging.totalPages} onPageChange={paging.setPage} />
        </aside>
        <section className="flex min-w-0 flex-col bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceaf2] px-5 py-4"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-[#eeecff] text-xs font-bold text-[#5b50d6]">{initials(activeClient.name)}</AvatarFallback></Avatar><div><p className="font-semibold text-[#353146]">{activeClient.name}</p><p className="text-xs text-[#9692a3]">{activeClient.username} · {activeConversation?.status ?? "no conversation"}{activeConversation?.assignedAdminName ? ` · ${activeConversation.assignedAdminName}` : ""}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction("assign_me")}>Assign to me</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction("pending")}>Pending</Button><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void onConversationAction(activeConversation?.status === "closed" ? "open" : "closed")}>{activeConversation?.status === "closed" ? "Reopen" : "Close"}</Button></div></div>
          <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,rgba(97,87,231,.06),transparent_18rem),linear-gradient(180deg,#fff_0%,#faf9fc_100%)] p-5">
            {messages.map((message) => <div key={message.id} className={`max-w-[82%] ${message.from === "admin" ? "ml-auto" : "mr-auto"}`}><div className={`rounded-[18px] px-4 py-3 text-sm leading-6 ${message.from === "admin" ? "rounded-br-md bg-[#6157e7] text-white shadow-[0_8px_20px_rgba(97,87,231,.16)]" : "rounded-bl-md border border-[#e9e6f0] bg-white text-[#464254] shadow-sm"}`}>{message.body && <p>{message.body}</p>}{message.attachment && <a href={message.attachment.downloadUrl ?? undefined} className="mt-2 flex items-center gap-2 rounded-lg bg-white/10 p-2 text-xs underline-offset-2 hover:underline"><Paperclip className="size-3.5" />{message.attachment.filename}</a>}</div><div className={`mt-1 flex items-center gap-2 text-xs text-[#aaa6b8] ${message.from === "admin" ? "justify-end" : ""}`}><span>{message.time}</span>{message.from === "admin" && message.status && <span>· {message.status}</span>}{message.status === "failed" && <button className="font-semibold text-[#b53847] underline" onClick={() => void onRetry(message.id)}>Retry</button>}</div>{message.lastDeliveryError && <p className="mt-1 text-right text-[11px] text-[#b53847]">{message.lastDeliveryError}</p>}</div>)}
          </div>
          <div className="border-t border-[#eceaf2] p-4"><div className="flex items-end gap-2"><label className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[#777287] hover:bg-[#f2f0f8]"><Paperclip className="size-4" /><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onAttachment(event.target.files?.[0] ?? null)} /><span className="sr-only">Attach PDF or image</span></label><Textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Write a message…" className="min-h-11 resize-none rounded-[14px] border-[#e3e0eb]" /><Button size="icon" className="size-11 shrink-0 rounded-[14px] bg-[#6157e7] text-white shadow-[0_8px_18px_rgba(97,87,231,.18)] hover:bg-[#554bcf]" onClick={onSend}><Send className="size-4" /><span className="sr-only">Send</span></Button></div>{attachment && <div className="mt-2 flex items-center justify-between rounded-xl border bg-[#faf9fc] px-3 py-2 text-xs"><span className="truncate"><Paperclip className="mr-1 inline size-3.5" />{attachment.name}</span><button className="font-semibold text-[#b53847]" onClick={() => onAttachment(null)}>Remove</button></div>}<p className="mt-2 text-center text-xs text-[#aaa6b8]">PDF/JPEG/PNG/WebP attachments are private, type-checked and passed through the configured malware scanner before Telegram delivery.</p></div>
        </section>
      </Card>
    </>
  );
}
function messagesForPreview(clientId: string) {
  return clientId === "usr-amir" ? "Perfect, thank you." : "It is approved and waiting…";
}


function OperationsView({ snapshot, onAlertAction, onControlAction }: { snapshot: OperationalSnapshot | null; onAlertAction: (id: string, action: "acknowledge" | "resolve") => void | Promise<void>; onControlAction: (key: OperationalSnapshot["controls"][number]["key"], enabled: boolean) => void | Promise<void> }) {
  if (!snapshot) return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#9692a3]">Loading operational health…</div>;
  const statusClass = snapshot.status === "critical" ? "border-red-200 bg-red-50 text-red-700" : snapshot.status === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const metrics = [
    ["Provider failures", snapshot.metrics.providerFailures],
    ["Provider timeouts", snapshot.metrics.providerTimeouts],
    ["Provider sync lag", snapshot.metrics.providerSyncLag],
    ["Email failures", snapshot.metrics.emailFailures],
    ["Email sync lag", snapshot.metrics.emailSyncLag],
    ["Telegram failures", snapshot.metrics.telegramDeliveryFailures],
    ["Webhook backlog", snapshot.metrics.webhookBacklog],
    ["OTP failures (24h)", snapshot.metrics.otpFailures24h],
    ["Stuck operations", snapshot.metrics.stuckOperations],
    ["Needs reconciliation", snapshot.metrics.reconciliationOperations],
    ["Secret reveals (15m)", snapshot.metrics.secretReveals15m],
  ] as const;
  return <div className="space-y-5">
    <PageIntro title="Operational health" description={`Live diagnostics generated ${new Date(snapshot.generatedAt).toLocaleString()}.`} />
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-sm">Overall status</CardTitle></CardHeader><CardContent><Badge variant="outline" className={statusClass}>{snapshot.status}</Badge></CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-sm">Database</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{snapshot.database.latencyMs} ms</p><p className="text-xs text-[#9692a3]">Health probe latency</p></CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-sm">Active alerts</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{snapshot.alerts.length}</p><p className="text-xs text-[#9692a3]">Open or acknowledged</p></CardContent></Card>
    </div>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Emergency controls</CardTitle><p className="text-sm text-[#9692a3]">Database-backed switches take effect without a restart. Deployment flags remain hard ceilings and cannot be overridden here.</p></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{snapshot.controls.map((control) => {
      const active = control.effectiveEnabled;
      const readOnly = control.key === "read_only_mode";
      const healthy = readOnly ? !active : active;
      return <div key={control.key} className={`rounded-xl border p-4 ${healthy ? "border-emerald-100 bg-emerald-50/40" : "border-red-200 bg-red-50/60"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{control.label}</p><Badge variant="outline" className={healthy ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{active ? "enabled" : "disabled"}</Badge>{(!control.deploymentAllowed || control.deploymentForced) && <Badge variant="outline" className="border-slate-300 text-slate-600">environment enforced</Badge>}</div><p className="mt-1 text-xs leading-5 text-[#777287]">{control.description}</p><p className="mt-2 text-[11px] text-[#9692a3]">{control.reason} · {new Date(control.updatedAt).toLocaleString()}</p></div>{snapshot.canManageControls && <Button size="sm" variant="outline" className="shrink-0 rounded-xl" disabled={readOnly && control.deploymentForced} onClick={() => void onControlAction(control.key, !control.runtimeEnabled)}>{control.runtimeEnabled ? "Disable" : "Enable"}</Button>}</div></div>;
    })}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Signal summary</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-[#9692a3]">{label}</p><p className={`mt-1 text-xl font-semibold ${value ? "text-amber-700" : ""}`}>{value}</p></div>)}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Operational alerts</CardTitle></CardHeader><CardContent className="space-y-3">{snapshot.alerts.length === 0 ? <p className="text-sm text-[#9692a3]">No active alerts.</p> : snapshot.alerts.map((alert) => <div key={alert.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={alert.severity === "critical" ? "border-red-200 text-red-700" : "border-amber-200 text-amber-700"}>{alert.severity}</Badge><span className="text-sm font-semibold">{alert.title}</span></div><p className="mt-1 text-xs text-[#9692a3]">{alert.detail} · seen {alert.occurrenceCount}× · {new Date(alert.lastSeenAt).toLocaleString()}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={alert.status === "acknowledged"} onClick={() => void onAlertAction(alert.id, "acknowledge")}>Acknowledge</Button><Button size="sm" variant="outline" onClick={() => void onAlertAction(alert.id, "resolve")}>Resolve</Button></div></div>)}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Scheduled workers</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Failures</TableHead><TableHead>Lag</TableHead><TableHead>Last success</TableHead></TableRow></TableHeader><TableBody>{snapshot.jobs.map((job) => <TableRow key={job.jobKey}><TableCell className="font-medium">{job.jobKey}</TableCell><TableCell><Badge variant="outline" className={job.status === "critical" ? "border-red-200 text-red-700" : job.status === "warning" ? "border-amber-200 text-amber-700" : "border-emerald-200 text-emerald-700"}>{job.status}</Badge></TableCell><TableCell>{job.consecutiveFailures}/{job.maxAttempts}</TableCell><TableCell>{job.lagSeconds}s</TableCell><TableCell>{job.lastSucceededAt ? new Date(job.lastSucceededAt).toLocaleString() : "Never"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Recent audit activity</CardTitle></CardHeader><CardContent className="space-y-2">{snapshot.recentAudit.slice(0, 20).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border p-3"><div><p className="text-sm font-medium">{item.action}</p><p className="text-xs text-[#9692a3]">{item.actorType} · {item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}{item.requestId ? ` · request ${item.requestId}` : ""}</p></div><span className="shrink-0 text-xs text-[#9692a3]">{new Date(item.createdAt).toLocaleString()}</span></div>)}</CardContent></Card>
  </div>;
}

function SettingsView({ serviceFee, exchangeRate, maxCardsPerClient, minimumFunding, botToken, showToken, telegramStatus, channels, newChannel, onServiceFee, onExchangeRate, onMaxCardsPerClient, onMinimumFunding, onSavePricing, onBotToken, onSaveBotToken, onClearBotToken, onShowToken, onConfigureWebhook, onNewChannel, onAddChannel, onRemoveChannel }: { serviceFee: number; exchangeRate: number; maxCardsPerClient: number; minimumFunding: number; botToken: string; showToken: boolean; telegramStatus: TelegramBotStatus | null; channels: string[]; newChannel: string; onServiceFee: (value: number) => void; onExchangeRate: (value: number) => void; onMaxCardsPerClient: (value: number) => void; onMinimumFunding: (value: number) => void; onSavePricing: () => void | Promise<void>; onBotToken: (value: string) => void; onSaveBotToken: () => void | Promise<void>; onClearBotToken: () => void | Promise<void>; onShowToken: (value: boolean) => void; onConfigureWebhook: () => void | Promise<void>; onNewChannel: (value: string) => void; onAddChannel: () => void | Promise<void>; onRemoveChannel: (channel: string) => void | Promise<void> }) {
  const [securityAdmin, setSecurityAdmin] = useState<CurrentAdmin | null>(null);
  const [securityPassword, setSecurityPassword] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadinessSnapshot | null>(null);
  const [providerReadinessLoading, setProviderReadinessLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentAdmin(controller.signal).then(setSecurityAdmin).catch(() => {});
    return () => controller.abort();
  }, []);

  const reloadProviderReadiness = async () => {
    setProviderReadinessLoading(true);
    try { setProviderReadiness(await fetchProviderReadiness()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load provider readiness."); }
    finally { setProviderReadinessLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    fetchProviderReadiness()
      .then((result) => { if (!cancelled) setProviderReadiness(result); })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load provider readiness."); });
    return () => { cancelled = true; };
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
      <PageIntro title="Operations settings" description="Configure the amounts and access rules clients see in Telegram." action={<Button className="h-11 rounded-[14px] bg-[#6157e7] px-4 text-white shadow-[0_8px_22px_rgba(97,87,231,.18)] hover:bg-[#554bcf]" onClick={() => toast.info("Settings persistence is not implemented yet; no production setting was changed.")}><Check className="size-4" />Save settings</Button>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="surface-card rounded-[24px] xl:col-span-2"><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><ShieldCheck className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Admin security</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Server-side session, recent reauthentication, and TOTP multi-factor authentication.</p></div></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-full">{securityAdmin?.email ?? "Loading admin…"}</Badge><Badge variant="outline" className={securityAdmin?.mfaEnabled ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700" : "rounded-full border-amber-200 bg-amber-50 text-amber-700"}>{securityAdmin?.mfaEnabled ? "MFA enabled" : "MFA not enabled"}</Badge><Badge variant="outline" className="rounded-full">{securityAdmin?.role ?? "—"}</Badge></div><div className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><Input type="password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} placeholder="Admin password for reauthentication" /><Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit MFA code (if enabled)" /><Button variant="outline" disabled={securityBusy} onClick={() => void handleReauthenticate()} className="rounded-xl">Reauthenticate</Button></div>{!securityAdmin?.mfaEnabled && !mfaSetup && <div className="space-y-2"><Button disabled={securityBusy} onClick={() => void handleMfaSetup()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]">Set up authenticator MFA</Button><p className="text-xs leading-5 text-[#8f8b9c]">Before setting up MFA, enter your admin password above and click <b>Reauthenticate</b> — the server requires a recent re-authentication for this action.</p></div>}{mfaSetup && <div className="space-y-3 rounded-[16px] border border-[#dedaff] bg-[#f8f7ff] p-4"><p className="text-sm font-semibold">Add this secret to your authenticator app</p><p className="break-all rounded-xl bg-white p-3 font-mono text-sm">{mfaSetup.secret}</p><p className="break-all text-xs text-[#777287]">{mfaSetup.otpauthUri}</p><div className="flex gap-2"><Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Current 6-digit code" /><Button disabled={securityBusy} onClick={() => void handleMfaEnable()} className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]">Enable MFA</Button></div></div>}{securityAdmin?.mfaEnabled && <div className="flex items-center gap-2"><Button variant="outline" disabled={securityBusy} onClick={() => void handleMfaDisable()} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">Disable MFA</Button><p className="text-xs text-[#8f8b9c]">Requires recent reauthentication plus the current authenticator code.</p></div>}<p className="text-xs leading-5 text-[#8f8b9c]">Sensitive credential reveal requires a recent reauthentication window. Session and secret events are recorded in the immutable audit log.</p></CardContent></Card>
        <Card className="surface-card rounded-[24px]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eeecff] text-[#6157e7]"><CircleDollarSign className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Pricing and exchange</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Calculate the Rial amount before a request is created.</p></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="service-fee">Your funding fee (%)</Label><Input id="service-fee" type="number" min="0" step="0.1" value={serviceFee} onChange={(event) => onServiceFee(Number(event.target.value))} /></div><div className="grid gap-2"><Label>Provider card fee</Label><Input value="4% + $1.00" readOnly className="bg-[#f8f7fb]" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="minimum-funding">Minimum card funding / card creation (USD)</Label><Input id="minimum-funding" type="number" min="1" step="1" value={minimumFunding} onChange={(event) => onMinimumFunding(Number(event.target.value))} /><p className="text-xs text-[#8f8b9c]">Enforced for card creation and card-funding operations. Funding requests snapshot pricing. Phase 16 can execute accepted requests through the guarded Kripicard fundcard workflow when its deployment switches and provider-readiness checks are enabled.</p></div></div><div className="grid gap-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="exchange-rate">Rial per 1 USD</Label><Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">Manual snapshot</Badge></div><Input id="exchange-rate" type="number" min="1" value={exchangeRate} onChange={(event) => onExchangeRate(Number(event.target.value))} /><div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3 text-xs leading-5 text-[#777287]"><p className="font-semibold text-[#353146]">Source: admin-approved manual snapshot</p><p>Saving creates a new immutable exchange-rate row used by new funding quotes until it expires.</p><p className="mt-1 text-[#9692a3]">Existing funding requests never recalculate when this value changes.</p></div><Button variant="outline" className="mt-3 rounded-xl" onClick={() => void onSavePricing()}><Check className="size-4" />Save pricing & rate snapshot</Button></div><div className="hero-grid rounded-[20px] p-5 text-white"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#c8c3ff]">Example · $100 card funding request</p><div className="mt-3 grid grid-cols-2 gap-4"><div><p className="text-sm text-[#aaa5c8]">USD basis</p><p className="mt-1 text-xl font-semibold">{formatUsd(total)}</p></div><div><p className="text-sm text-[#aaa5c8]">Client pays</p><p className="mt-1 text-xl font-semibold">{formatRial(total * exchangeRate)}</p></div></div><div className="mt-3 border-t border-white/10 pt-3 text-xs text-[#aaa5c8]">$100 + {formatUsd(providerFee)} provider + {formatUsd(ownFee)} service fee</div></div></CardContent></Card>

        <Card className="surface-card rounded-[24px]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#f1eefe] text-[#7864c9]"><Bot className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Telegram bot</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Webhook readiness, server-side token status, and required channels.</p></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-2"><Label htmlFor="bot-token">Bot token</Label><div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Input id="bot-token" type={showToken ? "text" : "password"} value={botToken} onChange={(event) => onBotToken(event.target.value)} placeholder={telegramStatus?.tokenHint ? `Update token (current ends ${telegramStatus.tokenHint})` : "Paste bot token from @BotFather"} className="pr-10" autoComplete="off" /><button type="button" aria-label={showToken ? "Hide token" : "Show token"} onClick={() => onShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9692a3]">{showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><Button className="rounded-xl bg-[#6157e7] text-white hover:bg-[#554bcf]" disabled={!botToken.trim()} onClick={() => void onSaveBotToken()}><Check className="size-4" />Save token</Button><Button variant="outline" className="rounded-xl" disabled={!telegramStatus?.configured} onClick={() => void onConfigureWebhook()}><Radio className="size-4" />Configure webhook</Button>{telegramStatus?.tokenSource === "database" && <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onClearBotToken()}><Trash2 className="size-4" />Clear</Button>}</div><p className="text-xs text-[#8f8b9c]">{telegramStatus?.tokenHint ? <>Current token: <code>••••{telegramStatus.tokenHint}</code> · stored {telegramStatus.tokenSource === "database" ? "encrypted in the database (set here)" : "in the server environment"}. Only the last 4 characters are ever shown.</> : <>Paste a token from <b>@BotFather</b> and click <b>Save token</b>. It is stored encrypted (AES-256-GCM); only the last 4 characters are shown afterward.</>}</p></div><div className="rounded-[14px] border border-[#ece9f2] bg-[#faf9fc] p-3 text-sm"><div className="flex flex-wrap gap-2"><Badge variant="outline" className={telegramStatus?.configured ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700" : "rounded-full border-amber-200 bg-amber-50 text-amber-700"}>{telegramStatus?.configured ? "Bot configured" : "Bot not configured"}</Badge>{telegramStatus?.bot?.username && <Badge variant="outline" className="rounded-full">@{telegramStatus.bot.username}</Badge>}{telegramStatus?.webhook?.url && <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">Webhook connected</Badge>}</div><p className="mt-2 break-all text-xs text-[#777287]">Expected webhook: {telegramStatus?.expectedWebhookUrl ?? "Configure Telegram environment variables to inspect status."}</p>{telegramStatus?.webhook?.lastErrorMessage && <p className="mt-1 text-xs text-red-600">Telegram: {telegramStatus.webhook.lastErrorMessage}</p>}{telegramStatus?.error && <p className="mt-1 text-xs text-red-600">Telegram: {telegramStatus.error}</p>}</div><div><div className="mb-2 flex items-center justify-between"><Label>Force-join channels</Label><Badge variant="outline" className="rounded-full">{channels.length} required</Badge></div><div className="space-y-2">{channels.map((channel) => <div key={channel} className="flex items-center gap-3 rounded-[14px] border border-[#ebe9f1] bg-[#fbfafc] p-3"><Hash className="size-4 text-[#9692a3]" /><span className="flex-1 text-sm font-medium">{channel}</span><button onClick={() => void onRemoveChannel(channel)} className="text-[#9692a3] hover:text-red-600"><Trash2 className="size-4" /><span className="sr-only">Remove {channel}</span></button></div>)}</div><div className="mt-2 flex gap-2"><Input value={newChannel} onChange={(event) => onNewChannel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onAddChannel(); } }} placeholder="@channel_username" /><Button variant="outline" className="rounded-xl" onClick={() => void onAddChannel()}><Plus className="size-4" />Add</Button></div><p className="mt-2 text-xs text-[#8f8b9c]">Membership checks fail open on Telegram/API configuration errors so one broken channel cannot lock out every client; explicit left/kicked status is enforced.</p></div><Alert className="rounded-[16px] border-[#cfeadf] bg-[#f0faf6]"><CheckCircle2 className="text-[#167957]" /><AlertTitle className="text-[#245f4c]">Telegram backend implemented</AlertTitle><AlertDescription className="text-[#4f7669]">Phase 10 includes verified/deduplicated webhooks, assignment and ban gates, opaque callbacks, cards/transactions, guarded freeze/unfreeze, support relay, and encrypted OTP delivery through the Telegram outbox worker.</AlertDescription></Alert></CardContent></Card>

        <Card className="surface-card rounded-[24px]">
          <CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#e6f8f1] text-[#16815e]"><ShieldCheck className="size-5" /></span><div><CardTitle className="text-[17px] tracking-[-.02em] text-[#2c2940]">Client card policy</CardTitle><p className="mt-1 text-sm text-[#8f8b9c]">Control card exposure across all accounts connected to a client.</p></div></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2"><Label htmlFor="client-card-limit">Maximum cards per client</Label><Input id="client-card-limit" type="number" min="1" max="50" value={maxCardsPerClient} onChange={(event) => onMaxCardsPerClient(Math.max(1, Number(event.target.value) || 1))} /><p className="text-xs leading-5 text-[#8f8b9c]">This is your own system-wide rule. It counts cards across every account assigned to the same Telegram user.</p></div>
            <div className="rounded-[16px] border border-[#cfeadf] bg-[#f0faf6] p-4 text-sm leading-6 text-[#336b59]"><strong>Separate concern:</strong> identity verification for registering in your service should live in a dedicated onboarding workflow. No verification status or document is sent to Kripicard here.</div>
          </CardContent>
        </Card>

        <Card className="surface-card rounded-[24px]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-800"><KeyRound className="size-5" /></span><div><CardTitle className="text-base">3DS code delivery</CardTitle><p className="mt-1 text-sm text-slate-500">Protect the mailbox while giving clients only their code.</p></div></div></CardHeader><CardContent className="space-y-4"><Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="text-amber-700" /><AlertTitle className="text-amber-950">3DS comes from the connected mailbox, not the Kripicard API</AlertTitle><AlertDescription className="text-amber-900/70">Phase 9 classifies trusted Outlook/Gmail verification messages, encrypts short-lived OTPs, and quarantines unknown templates. Add issuer sender/template rules only after validating real test messages.</AlertDescription></Alert><div className="space-y-3"><RoutingStep icon={Mail} title="Use a dedicated external mailbox" detail="Create or choose a mailbox from Outlook/Hotmail or Gmail and associate it with the Kripicard account." /><RoutingStep icon={ShieldCheck} title="Extract only the one-time code" detail="Read the mailbox through Microsoft Graph or the Gmail API, then parse only trusted verification messages." /><RoutingStep icon={Send} title="Relay to the assigned Telegram user" detail="Expire the code after delivery and keep a minimal audit event, not the message content." /></div><div className="rounded-xl border border-dashed p-3 text-sm text-slate-500"><strong>AccAbad email policy:</strong> use only Outlook/Hotmail or Gmail mailboxes. Connect them with OAuth using Microsoft Graph or the Gmail API. Do not depend on a custom AccAbad mail domain and do not store mailbox passwords for inbox access.</div><div className="overflow-hidden rounded-xl border text-sm"><div className="grid grid-cols-[1.1fr_1fr_1.4fr] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"><span>Provider</span><span>Inbox access</span><span>AccAbad approach</span></div>{[["Outlook / Hotmail","API","Microsoft Graph OAuth"],["Gmail","API","Gmail API OAuth"]].map(([provider, access, approach]) => <div key={provider} className="grid grid-cols-[1.1fr_1fr_1.4fr] border-t px-3 py-2.5"><span className="font-medium text-slate-700">{provider}</span><span className="text-slate-500">{access}</span><span className="text-slate-500">{approach}</span></div>)}</div></CardContent></Card>

        <Card className="surface-card rounded-[24px]"><CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${providerReadiness?.readyForMoneyWrites ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}><ShieldCheck className="size-5" /></span><div><CardTitle className="text-base">Kripicard money readiness</CardTitle><p className="mt-1 text-sm text-slate-500">Provider contract gate for deposits, card creation, and card funding. Phase 16 evaluates card creation and card funding independently from still-blocked deposit behavior.</p></div></div><Button variant="outline" size="sm" disabled={providerReadinessLoading} onClick={() => void reloadProviderReadiness()} className="rounded-xl"><RefreshCw className={`size-4 ${providerReadinessLoading ? "animate-spin" : ""}`} />Refresh</Button></div></CardHeader><CardContent className="space-y-4">
          <Alert className={providerReadiness?.readyForMoneyWrites ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}><AlertTriangle className={providerReadiness?.readyForMoneyWrites ? "text-emerald-700" : "text-amber-700"} /><AlertTitle>{providerReadiness?.readyByOperation?.card_create?.ready && providerReadiness?.readyByOperation?.card_fund?.ready ? "Card create + funding contracts cleared" : providerReadiness?.readyForMoneyWrites ? "Provider contract checks cleared" : "Some live money operations remain blocked"}</AlertTitle><AlertDescription>{providerReadiness ? `Card creation: ${providerReadiness.readyByOperation?.card_create?.ready ? "ready" : `blocked by ${(providerReadiness.readyByOperation?.card_create?.blockers ?? []).join(", ")}`}. Card funding: ${providerReadiness.readyByOperation?.card_fund?.ready ? "ready" : `blocked by ${(providerReadiness.readyByOperation?.card_fund?.blockers ?? []).join(", ")}`}. Deposit creation remains independently gated. ${providerReadiness.summary.blockers} broader provider question${providerReadiness.summary.blockers === 1 ? "" : "s"} remain. The supplied contract is wallet-based.` : "Loading provider readiness checks…"}</AlertDescription></Alert>
          {providerReadiness && <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">Base: {providerReadiness.providerBaseUrl}</Badge><Badge variant="outline">Model: account wallet</Badge><Badge variant="outline">Confirmed: {providerReadiness.summary.confirmed}/{providerReadiness.summary.total}</Badge><Badge variant="outline" className="border-amber-200 text-amber-700">Blockers: {providerReadiness.summary.blockers}</Badge></div>}
          <div className="divide-y rounded-xl border">{providerReadiness?.checks.map((check) => { const cleared = check.status === "confirmed" || check.status === "not_applicable"; return <div key={check.key} className="p-3"><div className="flex items-start gap-3"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${cleared ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{cleared ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{check.label}</p>{check.blocksLiveMoney && <Badge variant="outline" className="border-red-200 text-red-700">blocks live money</Badge>}</div><p className="mt-0.5 text-xs leading-5 text-slate-500">{check.requirement}</p>{check.note && <p className="mt-1 text-xs leading-5 text-slate-500">{check.note}</p>}{check.sourceReference && <p className="mt-1 text-[11px] text-slate-400">Evidence: {check.sourceReference}</p>}</div><Badge variant="outline" className={cleared ? "border-emerald-200 text-emerald-700" : check.status === "partial" ? "border-amber-200 text-amber-700" : "border-slate-200 text-slate-600"}>{check.status.replace("_", " ")}</Badge></div></div>; }) ?? <div className="p-4 text-sm text-slate-500">Provider readiness data is unavailable.</div>}</div>
          <p className="text-xs leading-5 text-slate-500">Super admins can record written provider confirmations through the protected readiness API. Public marketing material can add context but cannot clear a blocking appapi contract check; a provider-written answer or controlled live/sandbox test is required.</p>
        </CardContent></Card>
      </div>
    </>
  );
}

function RoutingStep({ icon: Icon, title, detail }: { icon: typeof Mail; title: string; detail: string }) {
  return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="size-4" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-sm leading-5 text-slate-500">{detail}</p></div></div>;
}
