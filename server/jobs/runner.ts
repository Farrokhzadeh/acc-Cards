import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "@/server/database/pool";
import { classifyPendingEmailMessages, expireOtpDeliveries } from "@/server/email/classifier";
import { expireStaleFundingRequests } from "@/server/funding/service";
import { syncConnectedGmailInboxesSystem } from "@/server/providers/google/service";
import { syncConnectedOutlookInboxesSystem } from "@/server/providers/microsoft/service";
import { syncKripicardAccountsSystem } from "@/server/providers/kripicard/service";
import { syncKripicardTransactionsSystem } from "@/server/providers/kripicard/transaction-sync";
import { processTelegramOutbox } from "@/server/telegram/outbox";
import { scanOperationalHealth } from "@/server/operations/service";
import { runtimeControlEnabled } from "@/server/operations/controls";
import { redactSensitiveText } from "@/server/security/redaction";

export type ScheduledJob = {
  jobKey: string;
  jobType: string;
  intervalSeconds: number;
  maxAttempts: number;
  consecutiveFailures: number;
  safeConfig: Record<string, unknown>;
};

type ClaimedRow = {
  job_key: string;
  job_type: string;
  interval_seconds: number;
  max_attempts: number;
  consecutive_failures: number;
  safe_config: Record<string, unknown>;
};

function intConfig(config: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
  const raw = Number(config[key]);
  return Number.isInteger(raw) && raw >= min && raw <= max ? raw : fallback;
}

function redactedError(error: unknown) {
  return redactSensitiveText(error);
}

function backoffSeconds(failures: number, baseInterval: number) {
  return Math.min(3600, Math.max(baseInterval, 15 * 2 ** Math.max(0, failures - 1)));
}

export async function claimDueJob(workerId: string, leaseSeconds: number): Promise<ScheduledJob | null> {
  return withTransaction(async (db) => {
    const result = await db.query<ClaimedRow>(
      `SELECT job_key,job_type,interval_seconds,max_attempts,consecutive_failures,safe_config
         FROM scheduled_jobs
        WHERE enabled=true
          AND next_run_at <= now()
          AND (lease_until IS NULL OR lease_until < now())
        ORDER BY next_run_at ASC, job_key ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return null;
    await db.query(
      `UPDATE scheduled_jobs
          SET lease_owner=$2,lease_until=now()+($3::int * interval '1 second'),last_started_at=now(),updated_at=now()
        WHERE job_key=$1`,
      [row.job_key, workerId, leaseSeconds],
    );
    return {
      jobKey: row.job_key,
      jobType: row.job_type,
      intervalSeconds: row.interval_seconds,
      maxAttempts: row.max_attempts,
      consecutiveFailures: row.consecutive_failures,
      safeConfig: row.safe_config ?? {},
    };
  });
}

async function runMaintenance() {
  const pool = getPool();
  const sessions = await pool.query(`DELETE FROM admin_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL`);
  const challenges = await pool.query(`DELETE FROM admin_auth_challenges WHERE expires_at <= now() OR consumed_at IS NOT NULL`);
  const idempotency = await pool.query(`DELETE FROM idempotency_keys WHERE expires_at IS NOT NULL AND expires_at <= now() AND status IN ('completed','failed')`);
  const rateLimits = await pool.query(`DELETE FROM security_rate_limits WHERE expires_at <= now()`);
  const expired = await expireOtpDeliveries(2000);
  return { sessionsDeleted: sessions.rowCount ?? 0, challengesDeleted: challenges.rowCount ?? 0, idempotencyDeleted: idempotency.rowCount ?? 0, rateLimitsDeleted: rateLimits.rowCount ?? 0, ...expired };
}

export async function executeJob(job: ScheduledJob, workerId: string) {
  const requestId = `worker:${workerId}:${randomUUID()}`;
  switch (job.jobType) {
    case "kripicard_card_sync":
      return syncKripicardAccountsSystem(requestId, intConfig(job.safeConfig, "batchSize", 25, 1, 200));
    case "kripicard_transaction_sync":
      return syncKripicardTransactionsSystem(requestId);
    case "outlook_sync":
      if (!await runtimeControlEnabled("outlook_sync")) return { skipped: true, reason: "runtime_control_disabled" };
      return syncConnectedOutlookInboxesSystem(requestId);
    case "gmail_sync":
      if (!await runtimeControlEnabled("gmail_sync")) return { skipped: true, reason: "runtime_control_disabled" };
      return syncConnectedGmailInboxesSystem(requestId);
    case "email_classify": {
      const classified = await classifyPendingEmailMessages({ limit: intConfig(job.safeConfig, "limit", 500, 1, 2000) });
      const expired = await expireOtpDeliveries(intConfig(job.safeConfig, "expireLimit", 1000, 1, 5000));
      return { ...classified, ...expired };
    }
    case "telegram_outbox":
      if (!await runtimeControlEnabled("telegram_sends")) return { skipped: true, reason: "runtime_control_disabled" };
      return processTelegramOutbox(intConfig(job.safeConfig, "limit", 200, 1, 1000));
    case "funding_request_expiry": {
      const expired = await expireStaleFundingRequests();
      return { expired: expired.length };
    }
    case "maintenance_expiry":
      return runMaintenance();
    case "operations_health_scan":
      return scanOperationalHealth();
    default:
      throw new Error(`unsupported_job_type:${job.jobType}`);
  }
}

export async function runClaimedJob(job: ScheduledJob, workerId: string) {
  const pool = getPool();
  const run = await pool.query<{ id: string }>(
    `INSERT INTO job_runs(job_type,job_key,scheduled_job_key,worker_id,status,attempts,safe_metadata)
     VALUES ($1,$2,$2,$3,'running',$4,$5::jsonb) RETURNING id`,
    [job.jobType, job.jobKey, workerId, job.consecutiveFailures + 1, JSON.stringify({ source: "phase19-worker" })],
  );
  const runId = run.rows[0].id;
  const startedAt = Date.now();
  try {
    const result = await executeJob(job, workerId);
    await withTransaction(async (db) => {
      await db.query(
        `UPDATE scheduled_jobs
            SET consecutive_failures=0,next_run_at=now()+($2::int * interval '1 second'),lease_owner=NULL,lease_until=NULL,
                last_succeeded_at=now(),last_error_redacted=NULL,updated_at=now()
          WHERE job_key=$1 AND lease_owner=$3`,
        [job.jobKey, job.intervalSeconds, workerId],
      );
      await db.query(`UPDATE job_runs SET status='succeeded',finished_at=now(),duration_ms=$3,safe_metadata=$2::jsonb WHERE id=$1::uuid`, [runId, JSON.stringify({ source: "phase20-worker", result }), Date.now()-startedAt]);
    });
    return { jobKey: job.jobKey, status: "succeeded" as const, result };
  } catch (error) {
    const failures = job.consecutiveFailures + 1;
    const terminal = failures >= job.maxAttempts;
    const delay = backoffSeconds(failures, job.intervalSeconds);
    const message = redactedError(error);
    await withTransaction(async (db) => {
      await db.query(
        `UPDATE scheduled_jobs
            SET consecutive_failures=$2,
                enabled=CASE WHEN $3::boolean THEN false ELSE enabled END,
                next_run_at=now()+($4::int * interval '1 second'),lease_owner=NULL,lease_until=NULL,
                last_failed_at=now(),last_error_redacted=$5,updated_at=now()
          WHERE job_key=$1 AND lease_owner=$6`,
        [job.jobKey, failures, terminal, delay, message, workerId],
      );
      await db.query(
        `UPDATE job_runs SET status=$2,finished_at=now(),duration_ms=$5,error_redacted=$3,next_retry_at=CASE WHEN $2='dead_letter' THEN NULL ELSE now()+($4::int * interval '1 second') END WHERE id=$1::uuid`,
        [runId, terminal ? "dead_letter" : "failed", message, delay, Date.now()-startedAt],
      );
    });
    return { jobKey: job.jobKey, status: terminal ? "dead_letter" as const : "failed" as const, error: message };
  }
}

export async function workerTick(workerId: string, leaseSeconds = 300) {
  const job = await claimDueJob(workerId, leaseSeconds);
  if (!job) return null;
  return runClaimedJob(job, workerId);
}
