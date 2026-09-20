# Production Rollout Runbook

Strategy: **all users in one approved maintenance window**  
Current state: **blocked; do not deploy or unlock**

## 1. Close every prerequisite

Phase 24 cannot be authorized until all of the following have signed, digest-pinned evidence:

- dependency and secret scans with no unresolved high/critical findings;
- external penetration test and retest;
- full Phase 23 staging acceptance, including duplicate/replay protection;
- fresh verified PostgreSQL + private-files backup and encrypted off-host copy;
- isolated restore drill using the release backup;
- production dashboards, alerts, paging, and log access;
- documented provider/local/audit reconciliation procedure;
- application-owner, security-reviewer, and operations-owner approvals.

Copy `rollout/production-rollout.example.json` to a secure operations path outside source control. Add no credentials, tokens, card data, or customer data.

## 2. Validate the release record

Set the exact file and validate its structure:

```bash
export ROLLOUT_CONFIG_FILE=/secure/operations/phase24-production.json
npm run rollout:validate
```

`valid: true` means only that the configuration structure is safe. `authorized: false` means rollout remains blocked.

Generate the human-readable execution plan:

```bash
export ROLLOUT_PLAN_OUTPUT=/secure/operations/phase24-execution-plan.json
npm run rollout:plan
```

Authorization must be checked again inside the maintenance window:

```bash
npm run rollout:authorize
```

Do not continue unless it reports both `valid: true` and `authorized: true`.

## 3. Enter maintenance

Before deployment, publish the approved notice and confirm the rollback owner is present. Production must start with:

```env
PRODUCTION_ROLLOUT_BLOCKED=true
FORCE_READ_ONLY_MODE=true
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_STATE_WRITES=false
ENABLE_KRIPICARD_CARD_CREATION=false
ENABLE_KRIPICARD_CARD_FUNDING=false
ENABLE_TELEGRAM_SENDS=false
ENABLE_OUTLOOK_SYNC=false
ENABLE_GMAIL_SYNC=false
```

Create the final backup, verify its manifest and off-host copy, and record its evidence digest. Deploy only the artifact digest in the approved configuration. Run forward migrations once, then verify `/health`, `/ready`, migration state, worker state, ClamAV, disk space, database capacity, alerts, logs, and rollback artifact while the lock remains active.

## 4. Open to all users

At the approved opening time, after a final go/no-go call:

```env
PRODUCTION_ROLLOUT_BLOCKED=false
PRODUCTION_ROLLOUT_AUTHORIZATION=PHASE24_RELEASE_AUTHORIZED
FORCE_READ_ONLY_MODE=false
```

Restart the app and worker with the exact approved environment. Keep all provider-write flags disabled. Open access to all users and watch authentication, HTTP error rate, latency, PostgreSQL saturation, queues, webhook failures, mailbox sync, Telegram delivery, antivirus, storage, and security alerts.

Email and Telegram may be enabled only after stable observation, one ceiling at a time, followed by their database runtime control. Live provider writes require a separate recorded decision and must retain existing provider-readiness, workflow, MFA, reauthentication, and runtime-control checks.

## 5. First production operations

Do not exceed `maximumInitialMoneyOperations`. For every operation compare:

1. provider record and final state;
2. local operation/request/card/transaction state;
3. idempotency and outbox records;
4. admin audit history;
5. Telegram notification recipient and delivery state.

Any mismatch or duplicate triggers immediate re-blocking and the rollback runbook.

## 6. Close the window

Record the exact artifact, database migration level, configuration digest, operator timeline, metrics, alerts, first-operation reconciliations, and decision. If the window expires before clean completion, re-enable the rollout lock and reschedule; never extend it informally.
