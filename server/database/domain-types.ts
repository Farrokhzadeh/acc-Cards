export type UUID = string;

export type AccountBalanceSource = "unavailable" | "provider" | "derived";
export type KripiAccountStatus = "pending" | "connected" | "attention" | "disabled" | "archived";
export type CardStatus = "unknown" | "active" | "frozen" | "closed" | "expired" | "attention";
export type EmailProvider = "outlook" | "gmail";
export type EmailConnectionStatus = "not_connected" | "connected" | "reauth_required" | "error" | "disabled";

export interface KripiAccountRecord {
  id: UUID;
  label: string;
  providerAccountRef: string | null;
  loginEmail: string;
  status: KripiAccountStatus;
  apiKeyHint: string | null;
  accountBalanceUsdCents: bigint | null;
  accountBalanceSource: AccountBalanceSource;
  accountBalanceAsOf: Date | null;
  lastVerifiedAt: Date | null;
  lastSyncedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface CardRecord {
  id: UUID;
  accountId: UUID;
  providerCardId: string | null;
  last4: string | null;
  bin: string | null;
  label: string | null;
  cardholderName: string | null;
  cardEmail: string | null;
  status: CardStatus;
  balanceUsdCents: bigint | null;
  balanceAsOf: Date | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  createdAt: Date;
}

export interface TelegramUserRecord {
  id: UUID;
  telegramUserId: bigint;
  username: string | null;
  displayName: string | null;
  bannedAt: Date | null;
  joinedAt: Date;
  createdAt: Date;
}

export interface EmailAccountRecord {
  id: UUID;
  accountId: UUID;
  provider: EmailProvider;
  emailAddress: string | null;
  connectionStatus: EmailConnectionStatus;
  providerIdentityEmail: string | null;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
}

export interface ClientSummaryRecord extends TelegramUserRecord {
  accountIds: UUID[];
  totalFundedUsdCents: bigint;
}
