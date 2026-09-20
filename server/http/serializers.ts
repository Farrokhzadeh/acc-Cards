import type {
  CardRecord,
  ClientSummaryRecord,
  EmailAccountRecord,
  KripiAccountRecord,
  TelegramUserRecord,
} from "@/server/database/domain-types";

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function cents(value: bigint | null) {
  return value == null ? null : value.toString();
}

export function serializeAccount(account: KripiAccountRecord) {
  return {
    id: account.id,
    label: account.label,
    providerAccountRef: account.providerAccountRef,
    loginEmail: account.loginEmail,
    status: account.status,
    apiKeyHint: account.apiKeyHint,
    accountBalanceUsdCents: cents(account.accountBalanceUsdCents),
    accountBalanceSource: account.accountBalanceSource,
    accountBalanceAsOf: iso(account.accountBalanceAsOf),
    lastVerifiedAt: iso(account.lastVerifiedAt),
    lastSyncedAt: iso(account.lastSyncedAt),
    archivedAt: iso(account.archivedAt),
    createdAt: account.createdAt.toISOString(),
  };
}

export function serializeCard(card: CardRecord) {
  return {
    id: card.id,
    accountId: card.accountId,
    providerCardId: card.providerCardId,
    last4: card.last4,
    bin: card.bin,
    label: card.label,
    cardholderName: card.cardholderName,
    cardEmail: card.cardEmail,
    status: card.status,
    balanceUsdCents: cents(card.balanceUsdCents),
    balanceAsOf: iso(card.balanceAsOf),
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    createdAt: card.createdAt.toISOString(),
  };
}

export function serializeTelegramUser(user: TelegramUserRecord) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    username: user.username,
    displayName: user.displayName,
    bannedAt: iso(user.bannedAt),
    joinedAt: user.joinedAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeClient(client: ClientSummaryRecord) {
  return {
    ...serializeTelegramUser(client),
    accountIds: client.accountIds,
    totalFundedUsdCents: client.totalFundedUsdCents.toString(),
  };
}

export function serializeEmailAccount(email: EmailAccountRecord | null) {
  if (!email) return null;
  return {
    id: email.id,
    accountId: email.accountId,
    provider: email.provider,
    emailAddress: email.emailAddress,
    connectionStatus: email.connectionStatus,
    providerIdentityEmail: email.providerIdentityEmail,
    lastSyncedAt: iso(email.lastSyncedAt),
    lastErrorCode: email.lastErrorCode,
    lastErrorMessage: email.lastErrorMessage,
    createdAt: email.createdAt.toISOString(),
  };
}
