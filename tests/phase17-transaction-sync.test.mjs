import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0016_transaction_sync_notifications.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../server/providers/kripicard/transaction-sync.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/jobs/kripicard-transactions/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../server/telegram/outbox.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../server/transactions/notifications.ts", import.meta.url), "utf8");
const reconciliationRoute = await readFile(new URL("../app/api/v1/transactions/[id]/notification/reconcile/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");
const providerClient = await readFile(new URL("../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const manualSync = await readFile(new URL("../server/providers/kripicard/service.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");

test("Phase 17 adds durable per-card sync state and transaction notification state", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS transaction_sync_state/);
  assert.match(migration, /baseline_completed boolean NOT NULL DEFAULT false/);
  assert.match(migration, /consecutive_failures/);
  assert.match(migration, /lease_until/);
  assert.match(migration, /notification_status/);
  assert.match(migration, /notification_reconciled_at/);
});

test("first scheduled sync establishes a baseline instead of alerting historical activity", () => {
  assert.match(worker, /baselineCompleted/);
  assert.match(worker, /const notify = baselineCompleted/);
  assert.match(worker, /baseline_completed=true/);
  assert.match(worker, /baselineEstablished/);
});

test("scheduled synchronization claims due cards safely and isolates card failures", () => {
  assert.match(worker, /FOR UPDATE OF c SKIP LOCKED/);
  assert.match(worker, /lease_until/);
  assert.match(worker, /recordFailure/);
  assert.match(worker, /consecutive_failures/);
  assert.match(worker, /retryAfterSeconds/);
  assert.match(worker, /for \(let index = 0; index < limit/);
});

test("provider transaction fingerprints and database uniqueness deduplicate overlapping sync windows", () => {
  assert.match(worker, /transactionFingerprint/);
  assert.match(worker, /ON CONFLICT \(card_id, fingerprint\)/);
  assert.match(worker, /telegram:card-transaction:/);
  assert.match(worker, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test("notifications are queued only for newly inserted post-baseline transactions", () => {
  assert.match(worker, /if \(!stored\?\.inserted\) continue/);
  assert.match(worker, /if \(notify && assignedUser\)/);
  assert.match(worker, /card_transaction\.detected/);
  assert.match(worker, /intendedUserId/);
});

test("Telegram delivery rechecks the original user's current account assignment", () => {
  assert.match(outbox, /deliverCardTransaction/);
  assert.match(outbox, /telegram_account_assignments/);
  assert.match(outbox, /intendedUserId/);
  assert.match(outbox, /assignment_changed/);
  assert.match(outbox, /protectContent: true/);
});

test("terminal Telegram failures become visible reconciliation issues", () => {
  assert.match(outbox, /notification_status='failed'/);
  assert.match(outbox, /card_transaction\.detected/);
  assert.match(reconciliation, /notification_status IN \('skipped','failed'\)/);
  assert.match(reconciliation, /notification_reconciled_at IS NULL/);
});

test("admins cannot resend ownership-change skips to a new user", () => {
  assert.match(reconciliation, /Skipped ownership notifications cannot be resent/);
  assert.match(reconciliation, /row\.current_user_id !== row\.intended_user_id/);
  assert.match(reconciliation, /old transaction will not be resent/);
  assert.match(reconciliationRoute, /transactions\.reconcile/);
  assert.match(reconciliationRoute, /requireCsrf/);
});

test("the protected transaction-sync job hook uses a deployment secret", () => {
  assert.match(env, /KRIPICARD_TRANSACTION_SYNC_JOB_SECRET/);
  assert.match(env, /KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS/);
  assert.match(env, /KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /syncKripicardTransactionsSystem/);
});

test("read retry handling honors provider Retry-After metadata", () => {
  assert.match(providerClient, /retryAfterMs/);
  assert.match(providerClient, /metadata\.retryAfterSeconds/);
  assert.match(providerClient, /Math\.max\(retryAfterMs/);
});

test("manual transaction synchronization establishes the scheduled notification baseline", () => {
  assert.match(manualSync, /manual sync is an explicit operator baseline/i);
  assert.match(manualSync, /baseline_completed=true/);
});

test("admin transaction UI loads stored provider data and exposes mismatch reconciliation", () => {
  assert.match(dashboard, /fetchTransactions/);
  assert.match(dashboard, /fetchTransactionNotificationIssues/);
  assert.match(dashboard, /Notification reconciliation/);
  assert.match(dashboard, /Retry safely/);
  assert.match(dashboard, /Acknowledge/);
});
