import type {
  CardRecord,
  ClientSummaryRecord,
  EmailAccountRecord,
  KripiAccountRecord,
  TelegramUserRecord,
  UUID,
} from "@/server/database/domain-types";

export interface PageRequest {
  limit: number;
  cursor?: {
    createdAt: string;
    id: UUID;
  };
  search?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}

export interface AccountRepository {
  findById(id: UUID): Promise<KripiAccountRecord | null>;
  list(page: PageRequest): Promise<PageResult<KripiAccountRecord>>;
  findAssignmentOwner(accountId: UUID): Promise<TelegramUserRecord | null>;
}

export interface CardRepository {
  findById(id: UUID): Promise<CardRecord | null>;
  list(page: PageRequest): Promise<PageResult<CardRecord>>;
  listForAccount(accountId: UUID, page: PageRequest): Promise<PageResult<CardRecord>>;
  listForTelegramUser(userId: UUID, page: PageRequest): Promise<PageResult<CardRecord>>;
}

export interface TelegramUserRepository {
  findById(id: UUID): Promise<TelegramUserRecord | null>;
  findByTelegramId(telegramUserId: bigint): Promise<TelegramUserRecord | null>;
  findSummaryById(id: UUID): Promise<ClientSummaryRecord | null>;
  list(page: PageRequest): Promise<PageResult<ClientSummaryRecord>>;
}

export interface EmailAccountRepository {
  findForAccount(accountId: UUID): Promise<EmailAccountRecord | null>;
}

export interface UnitOfWork {
  accounts: AccountRepository;
  cards: CardRepository;
  telegramUsers: TelegramUserRepository;
  emailAccounts: EmailAccountRepository;
  transaction<T>(work: (repositories: UnitOfWork) => Promise<T>): Promise<T>;
}
