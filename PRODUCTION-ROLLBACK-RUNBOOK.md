# Production Rollback Runbook

Rollback owner and communications lead must be named before a release can be authorized.

## Immediate containment

Trigger rollback on any configured threshold, any provider/local/audit mismatch, any unexpected duplicate, suspected credential/card-data exposure, authorization bypass, or uncertain financial result.

1. Set `PRODUCTION_ROLLOUT_BLOCKED=true` and `FORCE_READ_ONLY_MODE=true`.
2. Disable every provider write, Telegram send, and mailbox-sync environment ceiling.
3. Restart application and worker, confirm read-only is deployment-forced, and preserve request IDs/timestamps.
4. Use Operations controls to disable the same capabilities at the database layer.
5. Stop further money operations. Do not retry an ambiguous provider write.

## Application rollback

- Redeploy the exact previous artifact digest recorded in the rollout configuration.
- Keep the release lock and forced read-only mode active.
- Database migrations are forward-only by default. Do not reverse schema migrations ad hoc.
- Apply a reviewed forward compatibility/fix migration when the prior artifact cannot safely read the current schema.

## Financial reconciliation

- Reconcile each in-flight/ambiguous operation using safe provider reads.
- Compare provider state, local operation state, idempotency record, audit history, and notification/outbox state.
- Require provider-confirmed manual resolution where the provider result remains uncertain.
- Never redirect a notification to a new assignee after an ownership change.

## Restore boundary

Database/private-file restore is a disaster-recovery action, not a routine application rollback. Use `RECOVERY-RUNBOOK.md`, the guarded restore tool, and a separately approved incident decision. Preserve the failed-state database and private files before restoration.

## Reopening

Reopening requires root cause, remediation, repeated Phase 23 affected scenarios, updated security review where applicable, fresh backup evidence, new approvals, and a new maintenance window. Never reuse the previous authorization record.
