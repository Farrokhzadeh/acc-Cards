export type ApiAccount = {
  id: string;
  label: string;
  loginEmail: string;
  status: "pending" | "connected" | "attention" | "disabled" | "archived";
  apiKeyHint: string | null;
  accountBalanceUsdCents: string | null;
  accountBalanceSource: "unavailable" | "provider" | "derived";
  lastSyncedAt: string | null;
  emailAccount: null | {
    provider: "outlook" | "gmail";
    emailAddress: string;
    connectionStatus: "not_connected" | "connected" | "reauth_required" | "error" | "disabled";
    providerIdentityEmail: string | null;
    lastSyncedAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
};

export type ApiCard = {
  id: string;
  accountId: string;
  providerCardId: string | null;
  last4: string | null;
  bin: string | null;
  label: string | null;
  cardholderName: string | null;
  cardEmail: string | null;
  status: "unknown" | "active" | "frozen" | "closed" | "expired" | "attention";
  balanceUsdCents: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
};

export type ApiClient = {
  id: string;
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  bannedAt: string | null;
  joinedAt: string;
  accountIds: string[];
  totalFundedUsdCents: string;
};

export type DashboardSnapshot = {
  accounts: ApiAccount[];
  cards: ApiCard[];
  clients: ApiClient[];
  partial: boolean;
};

type ApiEnvelope<T> = { data: T; requestId: string };
type ApiFailure = { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };

export async function fetchDashboardSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  return apiJson<DashboardSnapshot>("/api/v1/dashboard", { method: "GET", signal });
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const chunk of document.cookie.split(";")) {
    const value = chunk.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
}

async function apiFormData<T>(url: string, form: FormData, method = "POST"): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  const csrf = readCookie("accabad_csrf");
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(url, { method, body: form, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T> | ApiFailure;
  if (!response.ok || !("data" in body)) {
    const failure = body as ApiFailure;
    throw new AdminApiError(
      response.status,
      failure.error?.message ?? `HTTP ${response.status}`,
      failure.error?.code,
      failure.error?.details,
      failure.error?.requestId,
    );
  }
  return body.data;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body) headers.set("content-type", "application/json");
  if (init?.method && init.method !== "GET" && init.method !== "HEAD") {
    const csrf = readCookie("accabad_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T> | ApiFailure;
  if (!response.ok || !("data" in body)) {
    const failure = body as ApiFailure;
    throw new AdminApiError(
      response.status,
      failure.error?.message ?? `HTTP ${response.status}`,
      failure.error?.code,
      failure.error?.details,
      failure.error?.requestId,
    );
  }
  return body.data;
}

export async function createAccount(input: { label: string; loginEmail: string; password: string; apiKey: string; emailProvider: "outlook" | "gmail"; emailAddress: string }) {
  return apiJson<{ id: string }>("/api/v1/accounts", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAccount(id: string, input: { label?: string; loginEmail?: string; password?: string; apiKey?: string; emailProvider?: "outlook" | "gmail"; emailAddress?: string }) {
  return apiJson<{ ok: true }>(`/api/v1/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function archiveAccount(id: string) {
  return apiJson<{ archived: true }>(`/api/v1/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function revealAccountSecrets(id: string) {
  return apiJson<{ loginEmail: string; password: string; apiKey: string }>(`/api/v1/accounts/${encodeURIComponent(id)}/reveal`, { method: "POST", body: "{}" });
}

export async function reauthenticateAdmin(password: string, code?: string) {
  return apiJson<{ ok: true; reauthenticatedAt: string }>("/api/v1/auth/reauthenticate", {
    method: "POST",
    body: JSON.stringify({ password, code: code || undefined }),
  });
}

export async function verifyAccountConnection(id: string) {
  return apiJson<{ connected: boolean; cardCount: number }>(`/api/v1/accounts/${encodeURIComponent(id)}/verify`, { method: "POST", body: "{}" });
}

export async function syncAccountCards(id: string) {
  return apiJson<{ syncedCards: number }>(`/api/v1/accounts/${encodeURIComponent(id)}/sync`, { method: "POST", body: "{}" });
}

export type LiveCardDetails = {
  cardNumber: string;
  expiry: string;
  cvv: string;
  balanceUsdCents: string;
  status: "unknown" | "active" | "frozen" | "closed" | "expired" | "attention";
  expiryMonth: number;
  expiryYear: number;
};

export async function revealLiveCardDetails(id: string) {
  return apiJson<LiveCardDetails>(`/api/v1/cards/${encodeURIComponent(id)}/details`, { method: "POST", body: "{}" });
}

export type StoredCardTransaction = {
  id: string;
  amountMinor: string;
  currency: string;
  type: string | null;
  status: string;
  merchant: string | null;
  reason: string | null;
  reasonCode: string | null;
  occurredAt: string;
};

export async function syncCardTransactions(id: string) {
  return apiJson<{ received: number; inserted: number; balanceUsdCents: string }>(`/api/v1/cards/${encodeURIComponent(id)}/transactions`, { method: "POST", body: "{}" });
}

export async function fetchCardTransactions(id: string) {
  return apiJson<{ items: StoredCardTransaction[] }>(`/api/v1/cards/${encodeURIComponent(id)}/transactions`, { method: "GET" });
}

export type ApiStoredTransaction = {
  id: string;
  clientId: string | null;
  accountId: string;
  cardId: string;
  last4: string | null;
  merchant: string | null;
  amountMinor: string;
  currency: string;
  transactionType: string | null;
  transactionStatus: string;
  occurredAt: string;
  notificationStatus: string;
  notificationError: string | null;
  notificationReconciledAt: string | null;
};

export async function fetchTransactions(input?: { search?: string; cursor?: string | null; limit?: number }) {
  const params = new URLSearchParams();
  if (input?.search) params.set("search", input.search);
  if (input?.cursor) params.set("cursor", input.cursor);
  params.set("limit", String(input?.limit ?? 100));
  return apiJson<{ items: ApiStoredTransaction[]; nextCursor: string | null }>(`/api/v1/transactions?${params.toString()}`, { method: "GET" });
}

export type TransactionNotificationIssue = {
  id: string;
  cardId: string;
  accountId: string;
  last4: string | null;
  amountMinor: string;
  currency: string;
  transactionType: string | null;
  transactionStatus: string;
  merchant: string | null;
  occurredAt: string;
  notificationStatus: "skipped" | "failed";
  notificationError: string | null;
  queuedAt: string | null;
  failedAt: string | null;
  skippedAt: string | null;
  reconciledAt: string | null;
};

export async function fetchTransactionNotificationIssues(input?: { search?: string; cursor?: string | null; limit?: number }) {
  const params = new URLSearchParams();
  if (input?.search) params.set("search", input.search);
  if (input?.cursor) params.set("cursor", input.cursor);
  params.set("limit", String(input?.limit ?? 50));
  return apiJson<{ items: TransactionNotificationIssue[]; nextCursor: string | null }>(`/api/v1/transactions/issues?${params.toString()}`, { method: "GET" });
}

export async function reconcileTransactionNotification(id: string, action: "acknowledge" | "retry", note?: string) {
  return apiJson<{ reconciled: true; action: "acknowledge" | "retry" }>(`/api/v1/transactions/${encodeURIComponent(id)}/notification/reconcile`, {
    method: "POST",
    body: JSON.stringify({ action, note: note || undefined }),
  });
}

export type CardStateResult = {
  operationId: string | null;
  status: "unknown" | "active" | "frozen" | "closed" | "expired" | "attention";
  balanceUsdCents: string | null;
  noOp: boolean;
  reconciled: boolean;
  needsReconciliation: boolean;
};

export async function setCardFrozenState(id: string, action: "freeze" | "unfreeze") {
  return apiJson<CardStateResult>(`/api/v1/cards/${encodeURIComponent(id)}/state`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function refreshCardStatus(id: string) {
  return apiJson<{ status: CardStateResult["status"]; balanceUsdCents: string | null; refreshedAt: string }>(
    `/api/v1/cards/${encodeURIComponent(id)}/status`,
    { method: "POST", body: "{}" },
  );
}

export type StoredEmailMessage = {
  id: string;
  providerMessageId: string;
  sender: string;
  recipient: string | null;
  subject: string;
  preview: string;
  category: string;
  receivedAt: string;
  unread: boolean;
  hasAttachments: boolean;
  providerRemoved: boolean;
  classificationStatus: string;
  parserNote: string | null;
  otpAvailable: boolean;
  otpDeliveryStatus: string | null;
  otpCodeLast2: string | null;
  otpExpiresAt: string | null;
};

export async function connectOutlookMailbox(id: string) {
  return apiJson<{ authorizationUrl: string; expiresInSeconds: number }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/outlook/connect`, { method: "POST", body: "{}" });
}

export async function syncOutlookMailbox(id: string) {
  return apiJson<{ received: number; removed: number; insertedOrUpdated: number; pages: number; partial: boolean }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/outlook/sync`, { method: "POST", body: "{}" });
}

export async function disconnectOutlookMailbox(id: string) {
  return apiJson<{ disconnected: true }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/outlook/disconnect`, { method: "POST", body: "{}" });
}


export async function connectGmailMailbox(id: string) {
  return apiJson<{ authorizationUrl: string; expiresInSeconds: number }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/gmail/connect`, { method: "POST", body: "{}" });
}

export async function syncGmailMailbox(id: string) {
  return apiJson<{ received: number; removed: number; insertedOrUpdated: number; pages: number; partial: boolean; fullSync: boolean }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/gmail/sync`, { method: "POST", body: "{}" });
}

export async function disconnectGmailMailbox(id: string) {
  return apiJson<{ disconnected: true }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/gmail/disconnect`, { method: "POST", body: "{}" });
}

export async function fetchAccountEmailMessages(id: string) {
  return apiJson<{ items: StoredEmailMessage[] }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/messages?limit=100`, { method: "GET" });
}

export async function classifyAccountEmail(id: string) {
  return apiJson<{ processed: number; classified: number; quarantined: number; otpCreated: number }>(`/api/v1/accounts/${encodeURIComponent(id)}/email/classify`, { method: "POST", body: "{}" });
}

export async function revealParsedOtp(messageId: string) {
  return apiJson<{ code: string; codeLast2: string | null; expiresAt: string; deliveryStatus: string; merchantContext: string | null; userId: string | null; cardId: string | null }>(`/api/v1/email/messages/${encodeURIComponent(messageId)}/otp`, { method: "POST", body: "{}" });
}

export async function fetchTrustedEmailRules() {
  return apiJson<{ items: Array<{ id: string; label: string; sender_match: string; subject_contains: string | null; category: string; otp_expiry_minutes: number; enabled: boolean }> }>("/api/v1/email/trusted-rules", { method: "GET" });
}

export async function createTrustedEmailRule(input: { label: string; senderMatch: string; subjectContains?: string | null; category: "verification" | "security" | "otp_3ds"; otpExpiryMinutes?: number }) {
  return apiJson<{ id: string }>("/api/v1/email/trusted-rules", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTrustedEmailRule(id: string, enabled: boolean) {
  return apiJson<{ ok: true }>(`/api/v1/email/trusted-rules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
}

export type TelegramBotStatus = {
  configured: boolean;
  tokenSource?: "database" | "environment" | "none";
  tokenHint?: string | null;
  error?: string | null;
  bot: null | { id: number; username: string | null; displayName: string };
  webhook: null | { url: string; pendingUpdates: number; lastErrorDate: string | null; lastErrorMessage: string | null; allowedUpdates: string[] };
  expectedWebhookUrl: string;
};

export async function fetchTelegramBotStatus() {
  return apiJson<TelegramBotStatus>("/api/v1/telegram/status", { method: "GET" });
}

export async function configureTelegramWebhook() {
  return apiJson<{ configured: true; url: string; pendingUpdates: number; lastErrorMessage: string | null }>("/api/v1/telegram/webhook/configure", { method: "POST", body: "{}" });
}

export async function setTelegramBotToken(token: string) {
  return apiJson<{ ok: true; tokenHint: string }>("/api/v1/telegram/bot-token", { method: "PUT", body: JSON.stringify({ token }) });
}

export async function clearTelegramBotToken() {
  return apiJson<{ ok: true }>("/api/v1/telegram/bot-token", { method: "DELETE" });
}

export async function fetchPaymentCard() {
  return apiJson<{ cardNumber: string; cardHolder: string; minLoadUsd: number; onboardingBin: string; allowedBins: Array<{ bin: string; requiresDob: boolean }> }>("/api/v1/settings/payment-card", { method: "GET" });
}

export async function updatePaymentCard(input: { cardNumber: string; cardHolder: string; minLoadUsd?: number; onboardingBin?: string }) {
  return apiJson<{ ok: true }>("/api/v1/settings/payment-card", { method: "PUT", body: JSON.stringify(input) });
}

export async function notifyClient(id: string) {
  return apiJson<{ ok: true }>(`/api/v1/clients/${encodeURIComponent(id)}/notify`, { method: "POST", body: "{}" });
}

export async function fetchClientPipeline() {
  return apiJson<{ items: Array<{ id: string; declared: boolean; status: string | null }> }>("/api/v1/clients/pipeline", { method: "GET" });
}

export async function setClientBanned(id: string, banned: boolean) {
  return apiJson<{ banned: boolean; bannedAt: string | null }>(`/api/v1/clients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ banned }),
  });
}

export type ClientKyc = {
  id: string; status: string; fullName: string; dateOfBirth: string | null; country: string;
  nationalId: string; phone: string; hasDocument: boolean; documentMimeType: string | null;
  reviewNote: string | null; submittedAt: string;
} | null;

export type ClientPayment = {
  declaredAt: string | null;
  hasReceipt: boolean;
  receiptMime: string | null;
  receiptAt: string | null;
  amountUsdCents: string | null;
  status: string | null;
  onboardingCardRequestId: string | null;
  onboardingCardId: string | null;
  onboardingCardLast4: string | null;
  onboardingCardRequestStatus: string | null;
} | null;

export async function fetchClientKyc(id: string) {
  return apiJson<{ kyc: ClientKyc; payment: ClientPayment }>(`/api/v1/clients/${encodeURIComponent(id)}/kyc`, { method: "GET" });
}

export function clientReceiptUrl(id: string) {
  return `/api/v1/clients/${encodeURIComponent(id)}/receipt`;
}

export async function activateClient(id: string, input: { action: "accept" | "deny" | "create_card" | "reconcile_card" | "complete"; accountId?: string }) {
  return apiJson<{ ok: true; status: string; cardId?: string | null; cardLast4?: string | null; needsReconciliation?: boolean }>(`/api/v1/clients/${encodeURIComponent(id)}/activate`, { method: "POST", body: JSON.stringify(input) });
}

export async function fetchForceJoinChannels() {
  return apiJson<{ items: Array<{ id: string; chatId: string; title: string; inviteUrl: string | null; enabled: boolean; sortOrder: number }> }>("/api/v1/telegram/force-join-channels", { method: "GET" });
}

export async function upsertForceJoinChannel(input: { chatId: string; title?: string; inviteUrl?: string | null; enabled?: boolean }) {
  return apiJson<{ id: string }>("/api/v1/telegram/force-join-channels", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteForceJoinChannel(chatId: string) {
  return apiJson<{ deleted: true }>("/api/v1/telegram/force-join-channels", { method: "DELETE", body: JSON.stringify({ chatId }) });
}

export type StoredSupportMessage = {
  id: string;
  direction: "client_to_admin" | "admin_to_client" | "system";
  text: string;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  lastDeliveryError: string | null;
  attachment: null | {
    id: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: string | null;
    scanStatus: string | null;
    downloadUrl: string;
  };
};

export type SupportConversationSummary = {
  id: string;
  userId: string;
  status: "open" | "pending" | "closed";
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  unreadAdminCount: number;
  unreadClientCount: number;
  lastMessageAt: string | null;
  client: { displayName: string | null; username: string | null; telegramUserId: string; banned: boolean };
  lastMessage: null | { text: string; direction: string; status: string };
};

export async function fetchSupportConversations(input: { search?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  return apiJson<{ items: SupportConversationSummary[] }>(`/api/v1/conversations?${params.toString()}`, { method: "GET" });
}

export async function updateSupportConversation(id: string, input: { status?: "open" | "pending" | "closed"; assignedAdminId?: string | null }) {
  return apiJson<{ status: "open" | "pending" | "closed"; assignedAdminId: string | null }>(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function fetchClientSupportMessages(clientId: string, opts: { limit?: number; before?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.before) qs.set("before", opts.before);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson<{ items: StoredSupportMessage[]; hasMore: boolean; nextBefore: string | null }>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/messages${suffix}`,
    { method: "GET" },
  );
}

export async function sendClientSupportMessage(clientId: string, text: string, attachment?: File | null) {
  if (attachment) {
    const form = new FormData();
    form.set("text", text);
    form.set("attachment", attachment);
    return apiFormData<{ id: string; queued: true }>(`/api/v1/clients/${encodeURIComponent(clientId)}/messages`, form);
  }
  return apiJson<{ id: string; queued: true }>(`/api/v1/clients/${encodeURIComponent(clientId)}/messages`, { method: "POST", body: JSON.stringify({ text }) });
}

export async function retrySupportMessage(messageId: string) {
  return apiJson<{ queued: true }>(`/api/v1/messages/${encodeURIComponent(messageId)}/retry`, { method: "POST", body: "{}" });
}

export type AssignableClientAccount = {
  id: string;
  label: string;
  loginEmail: string;
  status: string;
  selected: boolean;
  assignedAt: string | null;
};

export async function fetchClientAssignableAccounts(clientId: string, search = "") {
  const query = new URLSearchParams({ limit: "100" });
  if (search.trim()) query.set("search", search.trim());
  return apiJson<{ items: AssignableClientAccount[] }>(`/api/v1/clients/${encodeURIComponent(clientId)}/accounts?${query.toString()}`, { method: "GET" });
}

export async function assignClientAccount(clientId: string, accountId: string) {
  return apiJson<{ accountIds: string[]; changed: boolean }>(`/api/v1/clients/${encodeURIComponent(clientId)}/accounts/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    body: "{}",
  });
}

export async function unassignClientAccount(clientId: string, accountId: string) {
  return apiJson<{ accountIds: string[]; changed: boolean }>(`/api/v1/clients/${encodeURIComponent(clientId)}/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    body: "{}",
  });
}

export async function replaceClientAccounts(clientId: string, accountIds: string[]) {
  return apiJson<{ accountIds: string[]; changed: boolean; assignedCount: number; unassignedCount: number }>(`/api/v1/clients/${encodeURIComponent(clientId)}/accounts`, {
    method: "PUT",
    body: JSON.stringify({ accountIds }),
  });
}

export async function unassignAllClientAccounts(clientId: string) {
  return apiJson<{ accountIds: string[]; changed: boolean; removedCount: number }>(`/api/v1/clients/${encodeURIComponent(clientId)}/accounts`, {
    method: "DELETE",
    body: "{}",
  });
}

export type ApiCardRequest = {
  id: string;
  reference: string;
  userId: string;
  preferredAccountId: string | null;
  selectedAccountId: string | null;
  bin: string;
  initialAmountUsdCents: string;
  nameOnCard: string;
  email: string;
  dateOfBirth: string | null;
  status: "pending_review" | "approved" | "correction_needed" | "issuing" | "issue_failed" | "needs_reconciliation" | "issued" | "rejected" | "cancelled";
  adminNote: string | null;
  providerCardId: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  issuanceStartedAt?: string | null;
  issuedAt?: string | null;
  lastIssueOperationId?: string | null;
  client: { id: string; displayName: string | null; username: string | null; telegramUserId: string };
  eligibleAccounts: Array<{ id: string; label: string; loginEmail: string; status: string }>;
};

export async function fetchCardRequests(input: { search?: string; status?: string; limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams({ limit: String(input.limit ?? 100) });
  if (input.search?.trim()) query.set("search", input.search.trim());
  if (input.status?.trim()) query.set("status", input.status.trim());
  if (input.cursor) query.set("cursor", input.cursor);
  return apiJson<{ items: ApiCardRequest[]; nextCursor: string | null }>(`/api/v1/card-requests?${query.toString()}`, { method: "GET" });
}

export async function reviewCardRequest(id: string, input: { action: "approve" | "reject"; selectedAccountId?: string | null; note?: string | null }) {
  return apiJson<ApiCardRequest>(`/api/v1/card-requests/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CardIssuanceResult = {
  requestId: string;
  operationId: string;
  status: "issued" | "needs_reconciliation";
  cardId?: string;
  providerCardId?: string;
  reconciled: boolean;
  needsReconciliation: boolean;
  providerOutcome?: string;
};

export async function issueCardRequest(id: string) {
  return apiJson<CardIssuanceResult>(`/api/v1/card-requests/${encodeURIComponent(id)}/issue`, { method: "POST", body: "{}" });
}

export async function reconcileCardRequest(id: string) {
  return apiJson<CardIssuanceResult>(`/api/v1/card-requests/${encodeURIComponent(id)}/reconcile`, { method: "POST", body: "{}" });
}

export type ApiFundingRequest = {
  id: string;
  reference: string;
  userId: string;
  cardId: string;
  cardAmountUsdCents: string;
  providerFeeUsdCents: string;
  ownFeeUsdCents: string;
  clientPaysUsdCents: string;
  clientPaysRial: string | null;
  rateId: string | null;
  rateRialPerUsd: string | null;
  providerFeeBasisPoints: number;
  providerFeeFixedUsdCents: string;
  serviceFeeBasisPoints: number;
  quoteExpiresAt: string | null;
  status: "pending_receipt" | "pending_review" | "correction_needed" | "accepted" | "funding" | "funding_failed" | "needs_reconciliation" | "completed" | "rejected" | "cancelled";
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  issuanceStartedAt?: string | null;
  issuedAt?: string | null;
  lastIssueOperationId?: string | null;
  client: null | { displayName: string | null; username: string | null; telegramUserId: string };
  card: null | { last4: string | null; label: string | null; accountId: string };
  receipt: null | {
    id: string;
    original_filename: string | null;
    detected_mime_type: string | null;
    sizeBytes: string;
    sha256_hex: string;
    scan_status: string;
    scan_engine: string | null;
    scan_note: string | null;
    createdAt: string;
  };
};

export async function fetchFundingRequests(input: { search?: string; status?: string; limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams({ limit: String(input.limit ?? 100) });
  if (input.search?.trim()) query.set("search", input.search.trim());
  if (input.status?.trim()) query.set("status", input.status.trim());
  if (input.cursor) query.set("cursor", input.cursor);
  return apiJson<{ items: ApiFundingRequest[]; nextCursor: string | null }>(`/api/v1/funding-requests?${query.toString()}`, { method: "GET" });
}

export async function reviewFundingRequest(id: string, input: { action: "accept" | "reject" | "correction"; note?: string | null }) {
  return apiJson<ApiFundingRequest>(`/api/v1/funding-requests/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type FundingExecutionResult = {
  requestId: string;
  operationId: string;
  status: "completed" | "funding_failed" | "needs_reconciliation";
  needsReconciliation: boolean;
  reconciled: boolean;
  providerCardId?: string | null;
  providerOutcome?: string;
  safeToRetry?: boolean;
  evidence?: {
    preBalanceUsdCents: string | null;
    currentBalanceUsdCents: string;
    balanceDeltaUsdCents: string | null;
    newNonZeroTransactionCount: number;
    currentTransactionCount: number;
    currentCardStatus: string;
    observedAt: string;
  };
};

export async function executeFundingRequest(id: string) {
  return apiJson<FundingExecutionResult>(`/api/v1/funding-requests/${encodeURIComponent(id)}/fund`, { method: "POST", body: "{}" });
}

export async function reconcileFundingRequest(id: string) {
  return apiJson<FundingExecutionResult>(`/api/v1/funding-requests/${encodeURIComponent(id)}/reconcile`, { method: "POST", body: "{}" });
}

export async function resolveFundingRequest(id: string, input: { outcome: "completed" | "not_funded"; providerReference: string; note?: string | null }) {
  return apiJson<FundingExecutionResult>(`/api/v1/funding-requests/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify(input) });
}

export function fundingReceiptDownloadUrl(id: string) {
  return `/api/v1/funding-requests/${encodeURIComponent(id)}/receipt`;
}

export type FundingSettings = {
  minimumUsdCents: number;
  serviceFeeBasisPoints: number;
  providerFeeBasisPoints: number;
  providerFeeFixedUsdCents: number;
  quoteTtlMinutes: number;
  rate: null | { id: string; rialPerUsd: string; source: string; effectiveAt: string; expiresAt: string };
};

export async function fetchFundingSettings() {
  return apiJson<FundingSettings>("/api/v1/funding-settings", { method: "GET" });
}

export async function updateFundingSettings(input: { serviceFeeBasisPoints?: number; minimumUsdCents?: number; rialPerUsd?: number; rateValidMinutes?: number }) {
  return apiJson<FundingSettings>("/api/v1/funding-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export type CardPolicy = {
  platformCardLimit: number;
  minimumCardCreationUsdCents: number;
  bins: Array<{ bin: string; requiresDob: boolean }>;
};

export async function fetchCardPolicy() {
  return apiJson<CardPolicy>("/api/v1/settings/card-policy", { method: "GET" });
}

export async function updateCardPolicy(input: Partial<CardPolicy>) {
  return apiJson<CardPolicy>("/api/v1/settings/card-policy", { method: "PATCH", body: JSON.stringify(input) });
}

export type ProviderReadinessCheck = {
  key: string;
  category: string;
  label: string;
  requirement: string;
  status: "confirmed" | "partial" | "unresolved" | "not_applicable";
  sourceKind: "supplied_pdf" | "provider_written" | "live_test" | "official_public" | "none";
  sourceReference: string | null;
  note: string | null;
  blocksLiveMoney: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  updatedAt: string;
};

export type ProviderReadinessSnapshot = {
  providerProfile: string;
  providerBaseUrl: string;
  documentedPaymentModel: "wallet_based";
  directCryptoToCardSupportedBySuppliedContract: false;
  readyForMoneyWrites: boolean;
  readyByOperation: Record<"card_create" | "card_fund" | "deposit_create", { ready: boolean; blockers: string[] }>;
  moneyWriteImplementationEnabled: boolean;
  summary: { total: number; confirmed: number; blockers: number };
  checks: ProviderReadinessCheck[];
};

export async function fetchProviderReadiness() {
  return apiJson<ProviderReadinessSnapshot>("/api/v1/provider-readiness", { method: "GET" });
}

export async function updateProviderReadinessCheck(key: string, input: {
  status: ProviderReadinessCheck["status"];
  sourceKind: "provider_written" | "live_test" | "official_public" | "none";
  sourceReference?: string | null;
  note?: string | null;
}) {
  return apiJson<ProviderReadinessCheck>(`/api/v1/provider-readiness/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type OperationalSnapshot = {
  generatedAt: string;
  status: "healthy" | "warning" | "critical";
  database: { status: "healthy" | "warning" | "critical"; latencyMs: number };
  canManageControls: boolean;
  controls: Array<{
    key:"provider_writes"|"card_creation"|"card_funding"|"telegram_sends"|"outlook_sync"|"gmail_sync"|"read_only_mode";
    label:string; description:string; runtimeEnabled:boolean; deploymentAllowed:boolean; deploymentForced:boolean; effectiveEnabled:boolean;
    reason:string; updatedBy:string|null; updatedAt:string;
  }>;
  metrics: {
    providerFailures: number;
    providerTimeouts: number;
    providerSyncLag: number;
    emailFailures: number;
    emailSyncLag: number;
    telegramDeliveryFailures: number;
    webhookBacklog: number;
    otpFailures24h: number;
    stuckOperations: number;
    reconciliationOperations: number;
    secretReveals15m: number;
  };
  jobs: Array<{
    jobKey: string; jobType: string; enabled: boolean; intervalSeconds: number; consecutiveFailures: number; maxAttempts: number;
    nextRunAt: string; leaseOwner: string | null; leaseUntil: string | null; lastStartedAt: string | null; lastSucceededAt: string | null;
    lastFailedAt: string | null; lastError: string | null; lagSeconds: number; status: "healthy" | "warning" | "critical";
  }>;
  alerts: Array<{
    id:string; key:string; category:string; severity:"warning"|"critical"; status:"open"|"acknowledged"; title:string; detail:string;
    sourceType:string|null; sourceId:string|null; firstSeenAt:string; lastSeenAt:string; occurrenceCount:number;
  }>;
  recentAudit: Array<{
    id:string; actorType:string; actorId:string|null; action:string; entityType:string; entityId:string|null; metadata:Record<string,unknown>; requestId:string|null; createdAt:string;
  }>;
};

export async function fetchOperationalSnapshot() {
  return apiJson<OperationalSnapshot>("/api/v1/operations", { method: "GET" });
}

export async function updateOperationalAlert(id: string, action: "acknowledge" | "resolve") {
  return apiJson<{id:string;status:string;alert_key:string}>(`/api/v1/operations/alerts/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action }) });
}

export async function updateRuntimeControl(key: OperationalSnapshot["controls"][number]["key"], enabled: boolean, reason: string) {
  return apiJson<OperationalSnapshot["controls"][number]>(`/api/v1/operations/controls/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled, reason }),
  });
}

// --- KYC (Know Your Customer) ---

export type ApiKycSubmission = {
  id: string;
  telegramUserId: string;
  fullName: string;
  dateOfBirth: string | null;
  country: string;
  nationalId: string;
  phone: string;
  hasDocument: boolean;
  documentMimeType: string | null;
  documentFilename: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  createdAt: string;
  customer: { displayName: string | null; username: string | null; telegramUserId: string };
};

export async function fetchKycSubmissions(
  params?: { status?: "pending" | "approved" | "rejected" | "all"; search?: string; limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<{ items: ApiKycSubmission[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson<{ items: ApiKycSubmission[]; nextCursor: string | null }>(`/api/v1/kyc${suffix}`, { method: "GET", signal });
}

export async function fetchKycSubmission(id: string, signal?: AbortSignal): Promise<ApiKycSubmission> {
  return apiJson<ApiKycSubmission>(`/api/v1/kyc/${encodeURIComponent(id)}`, { method: "GET", signal });
}

export async function reviewKycSubmission(
  id: string,
  input: { decision: "approve" | "reject"; note?: string | null },
): Promise<{ ok: true; status: "pending" | "approved" | "rejected" }> {
  return apiJson<{ ok: true; status: "pending" | "approved" | "rejected" }>(
    `/api/v1/kyc/${encodeURIComponent(id)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function kycDocumentUrl(id: string): string {
  return `/api/v1/kyc/${encodeURIComponent(id)}/document`;
}
