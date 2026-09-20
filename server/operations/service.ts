import { getPool, withTransaction } from "@/server/database/pool";

export type HealthSeverity = "healthy" | "warning" | "critical";

type AlertCandidate = {
  key: string;
  category: "database" | "worker" | "provider" | "email" | "telegram" | "webhook" | "otp" | "operation" | "security";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  sourceType?: string;
  sourceId?: string;
};

function severityRank(value: HealthSeverity) {
  return value === "critical" ? 2 : value === "warning" ? 1 : 0;
}

function overallStatus(values: HealthSeverity[]): HealthSeverity {
  return values.reduce<HealthSeverity>((result, value) => severityRank(value) > severityRank(result) ? value : result, "healthy");
}

export async function collectOperationalSnapshot() {
  const pool = getPool();
  const started = Date.now();
  await pool.query("SELECT 1");
  const dbLatencyMs = Date.now() - started;

  const [jobsResult, countsResult, alertsResult, auditsResult] = await Promise.all([
    pool.query<{
      job_key:string; job_type:string; enabled:boolean; interval_seconds:number; consecutive_failures:number; max_attempts:number;
      next_run_at:Date; lease_owner:string|null; lease_until:Date|null; last_started_at:Date|null; last_succeeded_at:Date|null; last_failed_at:Date|null; last_error_redacted:string|null;
      lag_seconds:string;
    }>(`SELECT job_key,job_type,enabled,interval_seconds,consecutive_failures,max_attempts,next_run_at,lease_owner,lease_until,
              last_started_at,last_succeeded_at,last_failed_at,last_error_redacted,
              GREATEST(0, EXTRACT(EPOCH FROM (now()-next_run_at)))::bigint::text AS lag_seconds
         FROM scheduled_jobs ORDER BY job_key`),
    pool.query<{
      provider_errors:string; provider_timeouts:string; provider_stale:string; email_errors:string; email_stale:string; telegram_failures:string; webhook_backlog:string;
      otp_failures:string; stuck_operations:string; reconciliation_operations:string; secret_reveals:string;
    }>(`SELECT
      (SELECT count(*) FROM kripi_accounts WHERE archived_at IS NULL AND last_error_code IS NOT NULL)::text AS provider_errors,
      (SELECT count(*) FROM kripi_accounts WHERE archived_at IS NULL AND (last_error_code ILIKE '%timeout%' OR last_error_message ILIKE '%timeout%'))::text AS provider_timeouts,
      (SELECT count(*) FROM kripi_accounts WHERE archived_at IS NULL AND status='connected' AND (last_synced_at IS NULL OR last_synced_at < now()-interval '15 minutes'))::text AS provider_stale,
      (SELECT count(*) FROM email_accounts WHERE connection_status IN ('error','reauth_required'))::text AS email_errors,
      (SELECT count(*) FROM email_accounts WHERE connection_status='connected' AND (last_synced_at IS NULL OR last_synced_at < now()-interval '15 minutes'))::text AS email_stale,
      (SELECT count(*) FROM outbox_events WHERE topic LIKE 'telegram%' AND status IN ('failed','dead_letter'))::text AS telegram_failures,
      (SELECT count(*) FROM webhook_events WHERE status IN ('received','processing','failed') AND received_at < now()-interval '5 minutes')::text AS webhook_backlog,
      (SELECT count(*) FROM otp_deliveries WHERE delivery_status IN ('failed','quarantined') AND created_at > now()-interval '24 hours')::text AS otp_failures,
      (SELECT count(*) FROM card_operations WHERE status IN ('created','pending') AND updated_at < now()-interval '15 minutes')::text AS stuck_operations,
      (SELECT count(*) FROM card_operations WHERE status='needs_reconciliation')::text AS reconciliation_operations,
      (SELECT count(*) FROM audit_logs WHERE action IN ('account.secret.reveal','account.secrets.reveal','card.details.reveal','otp.reveal') AND created_at > now()-interval '15 minutes')::text AS secret_reveals`),
    pool.query<{id:string;alert_key:string;category:string;severity:string;status:string;title:string;detail_redacted:string;source_type:string|null;source_id:string|null;first_seen_at:Date;last_seen_at:Date;occurrence_count:number}>(
      `SELECT id,alert_key,category,severity,status,title,detail_redacted,source_type,source_id,first_seen_at,last_seen_at,occurrence_count
         FROM operational_alerts WHERE status <> 'resolved' ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 100`,
    ),
    pool.query<{id:string;actor_type:string;actor_id:string|null;action:string;entity_type:string;entity_id:string|null;metadata_redacted:Record<string,unknown>;request_id:string|null;created_at:Date}>(
      `SELECT id::text,actor_type,actor_id::text,action,entity_type,entity_id,metadata_redacted,request_id,created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 50`,
    ),
  ]);

  const counts = countsResult.rows[0];
  const jobs = jobsResult.rows.map((row) => {
    const lagSeconds = Number(row.lag_seconds);
    const status: HealthSeverity = !row.enabled || row.consecutive_failures >= row.max_attempts ? "critical"
      : row.consecutive_failures > 0 || lagSeconds > Math.max(row.interval_seconds * 2, 60) ? "warning" : "healthy";
    return { jobKey:row.job_key, jobType:row.job_type, enabled:row.enabled, intervalSeconds:row.interval_seconds, consecutiveFailures:row.consecutive_failures,
      maxAttempts:row.max_attempts, nextRunAt:row.next_run_at.toISOString(), leaseOwner:row.lease_owner, leaseUntil:row.lease_until?.toISOString() ?? null,
      lastStartedAt:row.last_started_at?.toISOString() ?? null, lastSucceededAt:row.last_succeeded_at?.toISOString() ?? null,
      lastFailedAt:row.last_failed_at?.toISOString() ?? null, lastError:row.last_error_redacted, lagSeconds, status };
  });
  const metrics = {
    providerFailures:Number(counts.provider_errors), providerTimeouts:Number(counts.provider_timeouts), providerSyncLag:Number(counts.provider_stale), emailFailures:Number(counts.email_errors), emailSyncLag:Number(counts.email_stale),
    telegramDeliveryFailures:Number(counts.telegram_failures), webhookBacklog:Number(counts.webhook_backlog), otpFailures24h:Number(counts.otp_failures),
    stuckOperations:Number(counts.stuck_operations), reconciliationOperations:Number(counts.reconciliation_operations), secretReveals15m:Number(counts.secret_reveals),
  };
  const metricStatuses: HealthSeverity[] = [
    dbLatencyMs > 1000 ? "critical" : dbLatencyMs > 250 ? "warning" : "healthy",
    ...jobs.map((job) => job.status),
    metrics.providerFailures || metrics.emailFailures || metrics.telegramDeliveryFailures || metrics.webhookBacklog || metrics.stuckOperations || metrics.reconciliationOperations ? "warning" : "healthy",
    metrics.secretReveals15m >= 10 ? "critical" : metrics.secretReveals15m >= 5 ? "warning" : "healthy",
  ];
  return {
    generatedAt:new Date().toISOString(), status:overallStatus(metricStatuses), database:{status:dbLatencyMs > 1000 ? "critical" : dbLatencyMs > 250 ? "warning" : "healthy", latencyMs:dbLatencyMs},
    metrics, jobs,
    alerts:alertsResult.rows.map((row) => ({ id:row.id, key:row.alert_key, category:row.category, severity:row.severity, status:row.status, title:row.title, detail:row.detail_redacted,
      sourceType:row.source_type, sourceId:row.source_id, firstSeenAt:row.first_seen_at.toISOString(), lastSeenAt:row.last_seen_at.toISOString(), occurrenceCount:row.occurrence_count })),
    recentAudit:auditsResult.rows.map((row) => ({ id:row.id, actorType:row.actor_type, actorId:row.actor_id, action:row.action, entityType:row.entity_type, entityId:row.entity_id,
      metadata:row.metadata_redacted, requestId:row.request_id, createdAt:row.created_at.toISOString() })),
  };
}

export async function scanOperationalHealth() {
  const snapshot = await collectOperationalSnapshot();
  const candidates: AlertCandidate[] = [];
  for (const job of snapshot.jobs) {
    if (job.status !== "healthy") candidates.push({ key:`job:${job.jobKey}`, category:"worker", severity:job.status === "critical" ? "critical" : "warning", title:`Scheduled job ${job.jobKey} is ${job.status}`,
      detail:job.lastError ? `failures=${job.consecutiveFailures}; lagSeconds=${job.lagSeconds}; error=${job.lastError}` : `failures=${job.consecutiveFailures}; lagSeconds=${job.lagSeconds}`, sourceType:"scheduled_job", sourceId:job.jobKey });
  }
  const m = snapshot.metrics;
  const countAlert = (condition:number, key:AlertCandidate["key"], category:AlertCandidate["category"], title:string, criticalAt:number) => {
    if (condition > 0) candidates.push({ key, category, severity:condition >= criticalAt ? "critical" : "warning", title, detail:`count=${condition}` });
  };
  countAlert(m.providerFailures, "provider:failures", "provider", "Kripicard provider failures detected", 5);
  countAlert(m.providerTimeouts, "provider:timeouts", "provider", "Kripicard provider timeouts detected", 3);
  countAlert(m.providerSyncLag, "provider:sync-lag", "provider", "Kripicard card sync lag detected", 10);
  countAlert(m.emailFailures, "email:failures", "email", "Mailbox connection failures detected", 5);
  countAlert(m.emailSyncLag, "email:sync-lag", "email", "Mailbox sync lag detected", 10);
  countAlert(m.telegramDeliveryFailures, "telegram:delivery", "telegram", "Telegram delivery failures detected", 10);
  countAlert(m.webhookBacklog, "webhook:backlog", "webhook", "Webhook backlog detected", 25);
  countAlert(m.otpFailures24h, "otp:failures", "otp", "OTP parsing or delivery failures detected", 10);
  countAlert(m.stuckOperations, "operation:stuck", "operation", "Stuck card operations detected", 3);
  countAlert(m.reconciliationOperations, "operation:reconciliation", "operation", "Operations require reconciliation", 3);
  if (m.secretReveals15m >= 5) candidates.push({ key:"security:secret-reveals", category:"security", severity:m.secretReveals15m >= 10 ? "critical" : "warning", title:"Repeated sensitive-data reveals detected", detail:`revealsIn15Minutes=${m.secretReveals15m}` });

  const activeKeys = candidates.map((item) => item.key);
  await withTransaction(async (db) => {
    for (const alert of candidates) {
      await db.query(`INSERT INTO operational_alerts(alert_key,category,severity,status,title,detail_redacted,source_type,source_id)
        VALUES ($1,$2,$3,'open',$4,$5,$6,$7)
        ON CONFLICT (alert_key) DO UPDATE SET category=EXCLUDED.category,severity=EXCLUDED.severity,title=EXCLUDED.title,detail_redacted=EXCLUDED.detail_redacted,
          source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,last_seen_at=now(),occurrence_count=operational_alerts.occurrence_count+1,
          status=CASE WHEN operational_alerts.status='resolved' THEN 'open' ELSE operational_alerts.status END,resolved_at=NULL,updated_at=now()`,
        [alert.key,alert.category,alert.severity,alert.title,alert.detail,alert.sourceType ?? null,alert.sourceId ?? null]);
    }
    if (activeKeys.length) await db.query(`UPDATE operational_alerts SET status='resolved',resolved_at=now(),updated_at=now() WHERE status <> 'resolved' AND NOT (alert_key = ANY($1::text[]))`, [activeKeys]);
    else await db.query(`UPDATE operational_alerts SET status='resolved',resolved_at=now(),updated_at=now() WHERE status <> 'resolved'`);
  });
  return { status:snapshot.status, activeAlerts:candidates.length };
}

export async function listAuditLog(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query(`SELECT id::text,actor_type,actor_id::text,action,entity_type,entity_id,metadata_redacted,ip::text,request_id,created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
  return { items: result.rows };
}

export async function updateOperationalAlert(id: string, action: "acknowledge" | "resolve", adminId: string) {
  const result = await getPool().query<{id:string;status:string;alert_key:string}>(
    `UPDATE operational_alerts
        SET status=$2,
            acknowledged_by=CASE WHEN $2='acknowledged' THEN $3::uuid ELSE acknowledged_by END,
            acknowledged_at=CASE WHEN $2='acknowledged' THEN now() ELSE acknowledged_at END,
            resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END,
            updated_at=now()
      WHERE id=$1::uuid
      RETURNING id,status,alert_key`,
    [id, action === "acknowledge" ? "acknowledged" : "resolved", adminId],
  );
  return result.rows[0] ?? null;
}
