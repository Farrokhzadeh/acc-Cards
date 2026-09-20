# Phase 11 — Client Assignment and Authorization

Status: **implemented in source**.

## Goal

Make the Telegram-user ↔ Kripicard-account ownership rule production-persistent, concurrency-safe, audited, and immediately authoritative for bot access.

The invariant remains:

- one Kripicard account can have at most one current Telegram owner;
- one Telegram user can own many Kripicard accounts.

## Database changes

Migration: `db/migrations/0010_client_account_assignments.sql`

Phase 11 adds:

- `telegram_account_assignment_events` for immutable assign/unassign history;
- indexes by Telegram user and account;
- append-only trigger protection for assignment history;
- `clients.assign` RBAC permission for Super Admin and Operator roles.

The existing `UNIQUE(account_id)` constraint on `telegram_account_assignments` remains the final database-level protection against one account being assigned to two users.

## Assignment service

`server/clients/assignments.ts` is the authoritative write layer.

It provides:

- server-side search for assignable accounts;
- assign one account;
- unassign one account;
- unassign all accounts;
- transactional replace-many support;
- row locking around client/account mutations;
- conflict mapping when another operator wins an assignment race;
- immutable assignment history;
- redacted audit-log entries in the same database transaction.

The service never silently steals an account from another Telegram client. Reassignment requires an explicit unassign followed by assign.

## Admin API

Collection endpoint:

```text
GET    /api/v1/clients/:id/accounts
POST   /api/v1/clients/:id/accounts
PUT    /api/v1/clients/:id/accounts
DELETE /api/v1/clients/:id/accounts
```

Item endpoint:

```text
PUT    /api/v1/clients/:id/accounts/:accountId
DELETE /api/v1/clients/:id/accounts/:accountId
```

All writes require:

- authenticated admin session;
- `clients.assign` permission;
- CSRF validation.

`GET` requires `clients.read`.

## Search behavior

The assignment picker no longer depends on a client-side scan of the dashboard snapshot in production mode.

The backend query searches the full account dataset and returns only:

- currently unassigned accounts; and
- accounts already assigned to the selected Telegram client.

Accounts owned by another client are excluded from the eligible result set. A concurrent assignment is still rechecked transactionally during the write.

## Concurrency behavior

For assignment writes:

1. lock the Telegram client row;
2. lock the target Kripicard account row;
3. inspect the current assignment under transaction;
4. reject an existing different owner;
5. insert the assignment;
6. rely on the database `UNIQUE(account_id)` constraint as the final race guard;
7. commit assignment history and audit metadata with the mutation.

A collision returns a conflict instead of moving ownership.

## Telegram authorization behavior

No Telegram authorization state is cached as ownership authority.

Existing bot handlers already re-query current assignments when they:

- evaluate the no-assignment gate;
- list cards;
- open card details;
- view transactions;
- freeze/unfreeze a card.

Therefore:

- assigning an account makes its cards available on the client's next bot command/callback;
- unassigning one account removes those cards on the next bot action;
- unassigning all causes the next bot action to return the contact-admin gate;
- stale card callback tokens cannot bypass ownership because `ownsCard()` rechecks the database.

## Admin UI

The client drawer now uses the Phase 11 APIs when PostgreSQL-backed mode is active.

It supports:

- server-side account search;
- connecting one account;
- disconnecting one account;
- disconnecting all accounts;
- pending-action UI state;
- explicit concurrency-conflict messaging.

Demo-only local mutation remains only as the non-production fallback when backend data is not loaded.

## Tests

Added:

- `tests/phase11-client-assignments.test.mjs`
- `integration-tests/client-assignment-foundation.test.mjs`

Coverage checks include:

- database one-owner invariant;
- assignment row locking/conflict semantics;
- server-side eligible-account filtering;
- RBAC + CSRF enforcement;
- transactional assign/unassign/replace operations;
- append-only assignment history;
- admin UI usage of production APIs;
- Telegram reauthorization from current assignments.

## Known limits

- Client banning/unbanning is still not a production write in this phase.
- Phase 11 does not create card requests or funding requests.
- Phase 11 does not move accounts between users automatically; ownership must be explicitly removed first.
- The dashboard bootstrap snapshot still has its existing bounded summary size; the assignment picker itself queries the complete eligible account dataset server-side.

## Rollback

Application rollback can deploy the Phase 10 code while leaving migration `0010` installed; the new table and permission are additive.

Do not drop assignment-event history in a normal rollback. If a destructive database rollback is absolutely required, preserve/export `telegram_account_assignment_events` first because it is operational audit history.

## Next phase

Phase 12 — Card Request Workflow.
