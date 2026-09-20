# Phase 20 — Audit, Observability, and Operations

Phase 20 gives operators a first-class operational view instead of requiring raw application-log access.

## Implemented

- append-only audit history remains enforced at PostgreSQL level
- authenticated `/api/v1/audit` audit-history endpoint with redacted metadata
- authenticated `/api/v1/operations` health snapshot
- Operations screen in the admin console with 30-second refresh
- PostgreSQL-backed `operational_alerts` with open / acknowledged / resolved lifecycle
- audited alert acknowledgement and resolution actions
- scheduled `operations-health-scan` worker
- job execution duration telemetry in `job_runs.duration_ms`
- health signals for:
  - PostgreSQL latency
  - worker failures, dead-letter state, leases, and scheduling lag
  - Kripicard account failures and card-sync lag
  - Outlook/Gmail connection failures and sync lag
  - Telegram outbox failures
  - webhook backlog
  - OTP failure/quarantine counts
  - stuck card operations and reconciliation-required operations
  - repeated sensitive-data reveal activity

## Migration

`db/migrations/0019_audit_observability_operations.sql`

The migration adds `operational_alerts`, operations permissions, job duration telemetry, and the recurring health-scan schedule.

## Alert behavior

The health scanner upserts stable alert keys rather than creating a new row every minute. Repeated observations increment `occurrence_count`. Alerts that are no longer present are resolved automatically. An acknowledged alert remains acknowledged while the condition persists; a resolved alert reopens if the condition returns.

No raw provider credentials, PAN/CVV, OTP values, OAuth tokens, Telegram tokens, or receipt contents are included in operational alert details or audit metadata.

## Operator surface

The new **Operations** view shows overall/database health, key failure and lag counters, durable alerts, scheduled-worker state, and recent redacted audit activity. Operators can acknowledge or resolve alerts without shell/database/log access.

## Next phase

Phase 21 adds backup/recovery controls, restore verification, and kill switches.
