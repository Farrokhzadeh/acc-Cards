import type { DatabaseQueryable } from "@/server/database/pool";
import { getPool, withTransaction } from "@/server/database/pool";
import type {
  AccountBalanceSource,
  CardRecord,
  CardStatus,
  ClientSummaryRecord,
  EmailAccountRecord,
  EmailConnectionStatus,
  EmailProvider,
  KripiAccountRecord,
  KripiAccountStatus,
  TelegramUserRecord,
  UUID,
} from "@/server/database/domain-types";
import { encodeCursor } from "@/server/http/cursor";
import type {
  AccountRepository,
  CardRepository,
  EmailAccountRepository,
  PageRequest,
  PageResult,
  TelegramUserRepository,
  UnitOfWork,
} from "@/server/repositories/contracts";

type AccountRow = {
  id: string;
  label: string;
  provider_account_ref: string | null;
  login_email: string;
  status: KripiAccountStatus;
  api_key_hint: string | null;
  account_balance_usd_cents: string | bigint | null;
  account_balance_source: AccountBalanceSource;
  account_balance_as_of: Date | string | null;
  last_verified_at: Date | string | null;
  last_synced_at: Date | string | null;
  archived_at: Date | string | null;
  created_at: Date | string;
};

type CardRow = {
  id: string;
  account_id: string;
  provider_card_id: string | null;
  last4: string | null;
  bin: string | null;
  label: string | null;
  cardholder_name: string | null;
  card_email: string | null;
  status: CardStatus;
  balance_usd_cents: string | bigint | null;
  balance_as_of: Date | string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  created_at: Date | string;
};

type UserRow = {
  id: string;
  telegram_user_id: string | bigint;
  username: string | null;
  display_name: string | null;
  banned_at: Date | string | null;
  joined_at: Date | string;
  created_at: Date | string;
};

type ClientSummaryRow = UserRow & {
  account_ids: string[] | null;
  total_funded_usd_cents: string | bigint | null;
};

type EmailAccountRow = {
  id: string;
  account_id: string;
  provider: EmailProvider;
  email_address: string;
  connection_status: EmailConnectionStatus;
  provider_identity_email: string | null;
  last_synced_at: Date | string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date | string;
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function asNullableDate(value: Date | string | null) {
  return value == null ? null : asDate(value);
}

function asNullableBigInt(value: string | bigint | null) {
  return value == null ? null : typeof value === "bigint" ? value : BigInt(value);
}

function mapAccount(row: AccountRow): KripiAccountRecord {
  return {
    id: row.id,
    label: row.label,
    providerAccountRef: row.provider_account_ref,
    loginEmail: row.login_email,
    status: row.status,
    apiKeyHint: row.api_key_hint,
    accountBalanceUsdCents: asNullableBigInt(row.account_balance_usd_cents),
    accountBalanceSource: row.account_balance_source,
    accountBalanceAsOf: asNullableDate(row.account_balance_as_of),
    lastVerifiedAt: asNullableDate(row.last_verified_at),
    lastSyncedAt: asNullableDate(row.last_synced_at),
    archivedAt: asNullableDate(row.archived_at),
    createdAt: asDate(row.created_at),
  };
}

function mapCard(row: CardRow): CardRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    providerCardId: row.provider_card_id,
    last4: row.last4,
    bin: row.bin,
    label: row.label,
    cardholderName: row.cardholder_name,
    cardEmail: row.card_email,
    status: row.status,
    balanceUsdCents: asNullableBigInt(row.balance_usd_cents),
    balanceAsOf: asNullableDate(row.balance_as_of),
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    createdAt: asDate(row.created_at),
  };
}

function mapUser(row: UserRow): TelegramUserRecord {
  return {
    id: row.id,
    telegramUserId: typeof row.telegram_user_id === "bigint" ? row.telegram_user_id : BigInt(row.telegram_user_id),
    username: row.username,
    displayName: row.display_name,
    bannedAt: asNullableDate(row.banned_at),
    joinedAt: asDate(row.joined_at),
    createdAt: asDate(row.created_at),
  };
}

function mapClient(row: ClientSummaryRow): ClientSummaryRecord {
  return {
    ...mapUser(row),
    accountIds: row.account_ids ?? [],
    totalFundedUsdCents: asNullableBigInt(row.total_funded_usd_cents) ?? 0n,
  };
}

function mapEmailAccount(row: EmailAccountRow): EmailAccountRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    emailAddress: row.email_address,
    connectionStatus: row.connection_status,
    providerIdentityEmail: row.provider_identity_email,
    lastSyncedAt: asNullableDate(row.last_synced_at),
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: asDate(row.created_at),
  };
}

function finalizePage<T extends { id: string; createdAt: Date }>(items: T[], limit: number): PageResult<T> {
  const hasMore = items.length > limit;
  const visible = hasMore ? items.slice(0, limit) : items;
  const last = visible.at(-1);
  return {
    items: visible,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : undefined,
  };
}

function addSearch(values: unknown[], where: string[], search: string | undefined, sql: string) {
  if (!search) return;
  values.push(`%${search}%`);
  where.push(sql.replaceAll("$SEARCH", `$${values.length}`));
}

function addCursor(
  values: unknown[],
  where: string[],
  page: PageRequest,
  alias: string,
  timestampColumn = "created_at",
) {
  if (!page.cursor) return;
  values.push(page.cursor.createdAt, page.cursor.id);
  const timestampIndex = values.length - 1;
  const idIndex = values.length;
  where.push(`(${alias}.${timestampColumn}, ${alias}.id) < ($${timestampIndex}::timestamptz, $${idIndex}::uuid)`);
}

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly db: DatabaseQueryable) {}

  async findById(id: UUID) {
    const result = await this.db.query<AccountRow>(
      `SELECT id, label, provider_account_ref, login_email, status, api_key_hint,
              account_balance_usd_cents, account_balance_source, account_balance_as_of,
              last_verified_at, last_synced_at, archived_at, created_at
         FROM kripi_accounts
        WHERE id = $1::uuid`,
      [id],
    );
    return result.rows[0] ? mapAccount(result.rows[0]) : null;
  }

  async list(page: PageRequest) {
    const values: unknown[] = [];
    const where = ["a.archived_at IS NULL"];
    addSearch(values, where, page.search, "(a.label ILIKE $SEARCH OR a.login_email ILIKE $SEARCH OR COALESCE(a.provider_account_ref, '') ILIKE $SEARCH)");
    addCursor(values, where, page, "a");
    values.push(page.limit + 1);

    const result = await this.db.query<AccountRow>(
      `SELECT a.id, a.label, a.provider_account_ref, a.login_email, a.status, a.api_key_hint,
              a.account_balance_usd_cents, a.account_balance_source, a.account_balance_as_of,
              a.last_verified_at, a.last_synced_at, a.archived_at, a.created_at
         FROM kripi_accounts a
        WHERE ${where.join(" AND ")}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${values.length}`,
      values,
    );

    return finalizePage(result.rows.map(mapAccount), page.limit);
  }

  async findAssignmentOwner(accountId: UUID) {
    const result = await this.db.query<UserRow>(
      `SELECT u.id, u.telegram_user_id, u.username, u.display_name, u.banned_at, u.joined_at, u.joined_at AS created_at
         FROM telegram_account_assignments a
         JOIN telegram_users u ON u.id = a.telegram_user_id
        WHERE a.account_id = $1::uuid`,
      [accountId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }
}

export class PgCardRepository implements CardRepository {
  constructor(private readonly db: DatabaseQueryable) {}

  async findById(id: UUID) {
    const result = await this.db.query<CardRow>(
      `SELECT id, account_id, provider_card_id, last4, bin, label, cardholder_name, card_email,
              status, balance_usd_cents, balance_as_of, expiry_month, expiry_year, created_at
         FROM cards
        WHERE id = $1::uuid AND archived_at IS NULL`,
      [id],
    );
    return result.rows[0] ? mapCard(result.rows[0]) : null;
  }

  async list(page: PageRequest) {
    return this.listInternal(page, [], ["c.archived_at IS NULL"]);
  }

  async listForAccount(accountId: UUID, page: PageRequest) {
    return this.listInternal(page, [accountId], ["c.archived_at IS NULL", "c.account_id = $1::uuid"]);
  }

  async listForTelegramUser(userId: UUID, page: PageRequest) {
    const values: unknown[] = [userId];
    const where = [
      "c.archived_at IS NULL",
      "EXISTS (SELECT 1 FROM telegram_account_assignments taa WHERE taa.account_id = c.account_id AND taa.telegram_user_id = $1::uuid)",
    ];
    return this.listInternal(page, values, where);
  }

  private async listInternal(page: PageRequest, initialValues: unknown[], initialWhere: string[]) {
    const values = [...initialValues];
    const where = [...initialWhere];
    addSearch(values, where, page.search, "(COALESCE(c.label, '') ILIKE $SEARCH OR COALESCE(c.provider_card_id, '') ILIKE $SEARCH OR COALESCE(c.last4, '') ILIKE $SEARCH OR COALESCE(c.bin, '') ILIKE $SEARCH OR COALESCE(c.cardholder_name, '') ILIKE $SEARCH)");
    addCursor(values, where, page, "c");
    values.push(page.limit + 1);

    const result = await this.db.query<CardRow>(
      `SELECT c.id, c.account_id, c.provider_card_id, c.last4, c.bin, c.label, c.cardholder_name, c.card_email,
              c.status, c.balance_usd_cents, c.balance_as_of, c.expiry_month, c.expiry_year, c.created_at
         FROM cards c
        WHERE ${where.join(" AND ")}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${values.length}`,
      values,
    );
    return finalizePage(result.rows.map(mapCard), page.limit);
  }
}

export class PgTelegramUserRepository implements TelegramUserRepository {
  constructor(private readonly db: DatabaseQueryable) {}

  async findById(id: UUID) {
    const result = await this.db.query<UserRow>(
      `SELECT id, telegram_user_id, username, display_name, banned_at, joined_at, joined_at AS created_at
         FROM telegram_users WHERE id = $1::uuid`,
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findByTelegramId(telegramUserId: bigint) {
    const result = await this.db.query<UserRow>(
      `SELECT id, telegram_user_id, username, display_name, banned_at, joined_at, joined_at AS created_at
         FROM telegram_users WHERE telegram_user_id = $1::bigint`,
      [telegramUserId.toString()],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findSummaryById(id: UUID) {
    const result = await this.db.query<ClientSummaryRow>(
      `SELECT u.id, u.telegram_user_id, u.username, u.display_name, u.banned_at, u.joined_at,
              u.joined_at AS created_at,
              COALESCE(array_agg(taa.account_id::text) FILTER (WHERE taa.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids,
              COALESCE((SELECT SUM(fr.card_amount_usd_cents) FROM funding_requests fr WHERE fr.user_id = u.id AND fr.status = 'completed'), 0)::bigint AS total_funded_usd_cents
         FROM telegram_users u
         LEFT JOIN telegram_account_assignments taa ON taa.telegram_user_id = u.id
        WHERE u.id = $1::uuid
        GROUP BY u.id`,
      [id],
    );
    return result.rows[0] ? mapClient(result.rows[0]) : null;
  }

  async list(page: PageRequest) {
    const values: unknown[] = [];
    const where = ["TRUE"];
    addSearch(values, where, page.search, "(COALESCE(u.display_name, '') ILIKE $SEARCH OR COALESCE(u.username, '') ILIKE $SEARCH OR u.telegram_user_id::text ILIKE $SEARCH)");
    addCursor(values, where, page, "u", "joined_at");
    values.push(page.limit + 1);

    const result = await this.db.query<ClientSummaryRow>(
      `SELECT u.id, u.telegram_user_id, u.username, u.display_name, u.banned_at, u.joined_at,
              u.joined_at AS created_at,
              COALESCE(array_agg(taa.account_id::text) FILTER (WHERE taa.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids,
              COALESCE((
                SELECT SUM(fr.card_amount_usd_cents)
                  FROM funding_requests fr
                 WHERE fr.user_id = u.id AND fr.status = 'completed'
              ), 0)::bigint AS total_funded_usd_cents
         FROM telegram_users u
         LEFT JOIN telegram_account_assignments taa ON taa.telegram_user_id = u.id
        WHERE ${where.join(" AND ")}
        GROUP BY u.id
        ORDER BY u.joined_at DESC, u.id DESC
        LIMIT $${values.length}`,
      values,
    );

    return finalizePage(result.rows.map(mapClient), page.limit);
  }
}

export class PgEmailAccountRepository implements EmailAccountRepository {
  constructor(private readonly db: DatabaseQueryable) {}

  async findForAccount(accountId: UUID) {
    const result = await this.db.query<EmailAccountRow>(
      `SELECT id, account_id, provider, email_address, connection_status, provider_identity_email, last_synced_at, last_error_code, last_error_message, created_at
         FROM email_accounts
        WHERE account_id = $1::uuid`,
      [accountId],
    );
    return result.rows[0] ? mapEmailAccount(result.rows[0]) : null;
  }
}

export class PgUnitOfWork implements UnitOfWork {
  readonly accounts: AccountRepository;
  readonly cards: CardRepository;
  readonly telegramUsers: TelegramUserRepository;
  readonly emailAccounts: EmailAccountRepository;

  constructor(private readonly db: DatabaseQueryable = getPool()) {
    this.accounts = new PgAccountRepository(db);
    this.cards = new PgCardRepository(db);
    this.telegramUsers = new PgTelegramUserRepository(db);
    this.emailAccounts = new PgEmailAccountRepository(db);
  }

  async transaction<T>(work: (repositories: UnitOfWork) => Promise<T>): Promise<T> {
    return withTransaction(async (client) => work(new PgUnitOfWork(client)));
  }
}

let sharedUnitOfWork: PgUnitOfWork | undefined;

export function getUnitOfWork() {
  sharedUnitOfWork ??= new PgUnitOfWork();
  return sharedUnitOfWork;
}
