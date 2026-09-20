# Phase 19 — Background Jobs and Queue

Phase 19 moves recurring asynchronous work from deployment cron/web-hook orchestration into a dedicated AccAbad worker coordinated through PostgreSQL.

## Implemented

- dedicated `accabad-worker` Docker service
- PostgreSQL `scheduled_jobs` registry
- atomic due-job claiming with `FOR UPDATE SKIP LOCKED`
- expiring worker leases so a crashed worker cannot permanently own a job
- per-job intervals and safe configuration
- bounded exponential retry/backoff
- automatic dead-letter by disabling a schedule after its configured consecutive-failure budget
- durable `job_runs` records including worker ID, retry time, safe result metadata, and redacted errors
- graceful SIGTERM/SIGINT worker shutdown
- jobs for:
  - Kripicard card synchronization
  - Kripicard transaction synchronization
  - Outlook synchronization
  - Gmail synchronization
  - email classification + OTP expiry
  - Telegram durable outbox delivery
  - stale admin session / challenge / expired idempotency cleanup
- existing internal cron-safe HTTP job routes remain available for compatibility, but normal production scheduling should use the dedicated worker

## Migration

`db/migrations/0018_background_jobs.sql`

The migration creates `scheduled_jobs`, seeds the initial schedules, and extends `job_runs` with schedule/worker/retry metadata.

## Concurrency and crash safety

A worker claims only one due schedule at a time inside a transaction using `FOR UPDATE SKIP LOCKED`, then writes a lease owner and expiry. Multiple worker replicas can therefore run without claiming the same scheduled execution simultaneously.

If a worker dies after claiming a job, the lease eventually expires and another worker can claim it. Individual money-changing provider operations retain their earlier phase-specific idempotency and reconciliation rules; Phase 19 does not introduce blind retries of unsafe provider writes.

## Failure policy

Each schedule tracks `consecutive_failures`. A failed run is retried after bounded exponential backoff. Once `max_attempts` consecutive scheduled executions fail, the schedule is disabled and the final `job_runs` record is marked `dead_letter`.

Re-enabling a dead-lettered schedule is an operational action and should only be done after investigating `last_error_redacted` and the underlying provider/system condition.

## Runtime configuration

```env
WORKER_POLL_INTERVAL_MS=1000
WORKER_LEASE_SECONDS=300
```

`WORKER_LEASE_SECONDS` must be longer than the expected normal execution time of one claimed scheduled job.

## Deployment

Run migrations first, then start both services:

```bash
docker compose up -d postgres db-migrate accabad-admin accabad-worker
```

The worker uses the same application image and secret environment as the web application, but has no listening HTTP port.

## Intentionally retained

The legacy `/api/internal/jobs/*` endpoints are retained so existing deployments are not broken during rollout. Do not schedule both the legacy cron hooks and the Phase 19 worker for the same job unless duplicate-safe behavior has been deliberately verified.

## Next phase

Phase 20 adds operational visibility, audit/observability improvements, alerting, and worker/job health surfaces.
