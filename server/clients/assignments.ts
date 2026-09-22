import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

export type AssignmentAccount = {
  id: string;
  label: string;
  loginEmail: string;
  status: string;
  selected: boolean;
  assignedAt: string | null;
};

type AccountRow = {
  id: string;
  label: string;
  login_email: string;
  status: string;
  telegram_user_id: string | null;
  assigned_at: Date | null;
};

type AssignmentRow = {
  account_id: string;
  telegram_user_id: string;
};

async function assertClientExists(db: DatabaseQueryable, clientId: string, lock = false) {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM telegram_users WHERE id = $1::uuid${lock ? " FOR UPDATE" : ""}`,
    [clientId],
  );
  if (!result.rows[0]) throw new ApiError(404, "not_found", "Telegram client not found.");
}

async function currentAccountIds(db: DatabaseQueryable, clientId: string) {
  const result = await db.query<{ account_id: string }>(
    `SELECT account_id
       FROM telegram_account_assignments
      WHERE telegram_user_id = $1::uuid
      ORDER BY assigned_at ASC, account_id ASC`,
    [clientId],
  );
  return result.rows.map((row) => row.account_id);
}

async function writeAssignmentAudit(db: DatabaseQueryable, args: {
  adminId: string;
  clientId: string;
  accountIds: string[];
  action: "assign" | "unassign" | "replace" | "unassign_all";
  requestId: string;
  ip?: string | null;
}) {
  await db.query(
    `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, ip, request_id)
     VALUES ('admin', $1::uuid, $2, 'telegram_user', $3, $4::jsonb, $5::inet, $6)`,
    [
      args.adminId,
      `client.accounts.${args.action}`,
      args.clientId,
      JSON.stringify({ accountIds: args.accountIds, count: args.accountIds.length }),
      args.ip ?? null,
      args.requestId,
    ],
  );
}

async function insertAssignmentEvents(db: DatabaseQueryable, args: {
  clientId: string;
  accountIds: string[];
  eventType: "assigned" | "unassigned";
  adminId: string;
  requestId: string;
}) {
  if (!args.accountIds.length) return;
  await db.query(
    `INSERT INTO telegram_account_assignment_events(telegram_user_id, account_id, event_type, admin_id, request_id)
     SELECT $1::uuid, x.account_id, $2, $3::uuid, $4
       FROM unnest($5::uuid[]) AS x(account_id)`,
    [args.clientId, args.eventType, args.adminId, args.requestId, args.accountIds],
  );
}

function mapAccount(row: AccountRow, clientId: string): AssignmentAccount {
  return {
    id: row.id,
    label: row.label,
    loginEmail: row.login_email,
    status: row.status,
    selected: row.telegram_user_id === clientId,
    assignedAt: row.telegram_user_id === clientId && row.assigned_at ? row.assigned_at.toISOString() : null,
  };
}

export async function listAssignableAccounts(clientId: string, search = "", limit = 50) {
  await assertClientExists(getPool(), clientId);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const needle = search.trim().slice(0, 200);
  const result = await getPool().query<AccountRow>(
    `SELECT a.id, a.label, a.login_email, a.status, taa.telegram_user_id, taa.assigned_at
       FROM kripi_accounts a
       LEFT JOIN telegram_account_assignments taa ON taa.account_id = a.id
      WHERE a.archived_at IS NULL
        AND a.status NOT IN ('disabled','archived')
        AND (taa.telegram_user_id IS NULL OR taa.telegram_user_id = $1::uuid)
        AND ($2 = '' OR a.label ILIKE '%' || $2 || '%' OR a.login_email ILIKE '%' || $2 || '%' OR COALESCE(a.provider_account_ref, '') ILIKE '%' || $2 || '%')
      ORDER BY (taa.telegram_user_id = $1::uuid) DESC, a.label ASC, a.id ASC
      LIMIT $3`,
    [clientId, needle, safeLimit],
  );
  return result.rows.map((row) => mapAccount(row, clientId));
}

export async function assignAccountInTransaction(db: DatabaseQueryable, args: {
  clientId: string;
  accountId: string;
  adminId: string;
  requestId: string;
  ip?: string | null;
}) {
  await assertClientExists(db, args.clientId, true);
  const account = await db.query<{ id: string; archived_at: Date | null; status: string }>(
    `SELECT id, archived_at, status FROM kripi_accounts WHERE id = $1::uuid FOR UPDATE`,
    [args.accountId],
  );
  if (!account.rows[0] || account.rows[0].archived_at || ["disabled", "archived"].includes(account.rows[0].status)) {
    throw new ApiError(404, "account_not_found", "Kripicard account not found or unavailable.");
  }

  const owner = await db.query<AssignmentRow>(
    `SELECT account_id, telegram_user_id
       FROM telegram_account_assignments
      WHERE account_id = $1::uuid
      FOR UPDATE`,
    [args.accountId],
  );
  if (owner.rows[0]?.telegram_user_id === args.clientId) {
    return { accountIds: await currentAccountIds(db, args.clientId), changed: false };
  }
  if (owner.rows[0]) {
    throw new ApiError(409, "account_already_assigned", "That Kripicard account is already assigned to another Telegram client.");
  }

  try {
    await db.query(
      `INSERT INTO telegram_account_assignments(telegram_user_id, account_id, assigned_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [args.clientId, args.accountId, args.adminId],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "account_already_assigned", "Another operator assigned that account first. Refresh the client and try again.");
    }
    throw error;
  }

  await insertAssignmentEvents(db, { clientId: args.clientId, accountIds: [args.accountId], eventType: "assigned", adminId: args.adminId, requestId: args.requestId });
  await writeAssignmentAudit(db, { adminId: args.adminId, clientId: args.clientId, accountIds: [args.accountId], action: "assign", requestId: args.requestId, ip: args.ip });
  return { accountIds: await currentAccountIds(db, args.clientId), changed: true };
}

export async function assignAccount(args: {
  clientId: string;
  accountId: string;
  adminId: string;
  requestId: string;
  ip?: string | null;
}) {
  return withTransaction((db) => assignAccountInTransaction(db, args));
}

export async function unassignAccount(args: {
  clientId: string;
  accountId: string;
  adminId: string;
  requestId: string;
  ip?: string | null;
}) {
  return withTransaction(async (db) => {
    await assertClientExists(db, args.clientId, true);
    const result = await db.query<{ account_id: string }>(
      `DELETE FROM telegram_account_assignments
        WHERE telegram_user_id = $1::uuid AND account_id = $2::uuid
        RETURNING account_id`,
      [args.clientId, args.accountId],
    );
    if (!result.rows[0]) {
      const owner = await db.query<{ telegram_user_id: string }>(
        `SELECT telegram_user_id FROM telegram_account_assignments WHERE account_id = $1::uuid`,
        [args.accountId],
      );
      if (owner.rows[0]) throw new ApiError(409, "assignment_changed", "That account is no longer assigned to this client. Refresh and try again.");
      return { accountIds: await currentAccountIds(db, args.clientId), changed: false };
    }
    await insertAssignmentEvents(db, { clientId: args.clientId, accountIds: [args.accountId], eventType: "unassigned", adminId: args.adminId, requestId: args.requestId });
    await writeAssignmentAudit(db, { adminId: args.adminId, clientId: args.clientId, accountIds: [args.accountId], action: "unassign", requestId: args.requestId, ip: args.ip });
    return { accountIds: await currentAccountIds(db, args.clientId), changed: true };
  });
}

export async function unassignAllAccounts(args: {
  clientId: string;
  adminId: string;
  requestId: string;
  ip?: string | null;
}) {
  return withTransaction(async (db) => {
    await assertClientExists(db, args.clientId, true);
    const locked = await db.query<{ account_id: string }>(
      `SELECT account_id FROM telegram_account_assignments WHERE telegram_user_id = $1::uuid FOR UPDATE`,
      [args.clientId],
    );
    const accountIds = locked.rows.map((row) => row.account_id);
    if (!accountIds.length) return { accountIds: [], changed: false, removedCount: 0 };
    await db.query(`DELETE FROM telegram_account_assignments WHERE telegram_user_id = $1::uuid`, [args.clientId]);
    await insertAssignmentEvents(db, { clientId: args.clientId, accountIds, eventType: "unassigned", adminId: args.adminId, requestId: args.requestId });
    await writeAssignmentAudit(db, { adminId: args.adminId, clientId: args.clientId, accountIds, action: "unassign_all", requestId: args.requestId, ip: args.ip });
    return { accountIds: [], changed: true, removedCount: accountIds.length };
  });
}

export async function replaceClientAccounts(args: {
  clientId: string;
  accountIds: string[];
  adminId: string;
  requestId: string;
  ip?: string | null;
}) {
  const desired = [...new Set(args.accountIds)].sort();
  if (desired.length > 100) throw new ApiError(400, "validation_error", "A client cannot be assigned more than 100 accounts in one request.");
  return withTransaction(async (db) => {
    await assertClientExists(db, args.clientId, true);

    if (desired.length) {
      const accounts = await db.query<{ id: string }>(
        `SELECT id FROM kripi_accounts WHERE id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY id FOR UPDATE`,
        [desired],
      );
      if (accounts.rows.length !== desired.length) throw new ApiError(400, "invalid_account", "One or more selected accounts do not exist or are archived.");
      const conflicts = await db.query<{ account_id: string }>(
        `SELECT account_id
           FROM telegram_account_assignments
          WHERE account_id = ANY($1::uuid[]) AND telegram_user_id <> $2::uuid
          FOR UPDATE`,
        [desired, args.clientId],
      );
      if (conflicts.rows.length) {
        throw new ApiError(409, "account_already_assigned", "One or more selected accounts were assigned to another client. Refresh and try again.", { accountIds: conflicts.rows.map((row) => row.account_id) });
      }
    }

    const currentResult = await db.query<{ account_id: string }>(
      `SELECT account_id FROM telegram_account_assignments WHERE telegram_user_id = $1::uuid FOR UPDATE`,
      [args.clientId],
    );
    const current = new Set(currentResult.rows.map((row) => row.account_id));
    const wanted = new Set(desired);
    const toRemove = [...current].filter((id) => !wanted.has(id));
    const toAdd = desired.filter((id) => !current.has(id));

    if (toRemove.length) {
      await db.query(
        `DELETE FROM telegram_account_assignments WHERE telegram_user_id = $1::uuid AND account_id = ANY($2::uuid[])`,
        [args.clientId, toRemove],
      );
    }
    if (toAdd.length) {
      try {
        await db.query(
          `INSERT INTO telegram_account_assignments(telegram_user_id, account_id, assigned_by)
           SELECT $1::uuid, x.account_id, $2::uuid FROM unnest($3::uuid[]) AS x(account_id)`,
          [args.clientId, args.adminId, toAdd],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new ApiError(409, "account_already_assigned", "Another operator changed one of these assignments first. Refresh and try again.");
        }
        throw error;
      }
    }

    await insertAssignmentEvents(db, { clientId: args.clientId, accountIds: toRemove, eventType: "unassigned", adminId: args.adminId, requestId: args.requestId });
    await insertAssignmentEvents(db, { clientId: args.clientId, accountIds: toAdd, eventType: "assigned", adminId: args.adminId, requestId: args.requestId });
    if (toRemove.length || toAdd.length) {
      await writeAssignmentAudit(db, { adminId: args.adminId, clientId: args.clientId, accountIds: desired, action: "replace", requestId: args.requestId, ip: args.ip });
    }
    return { accountIds: desired, changed: Boolean(toRemove.length || toAdd.length), assignedCount: toAdd.length, unassignedCount: toRemove.length };
  });
}
