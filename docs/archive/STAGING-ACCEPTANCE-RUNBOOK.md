# Staging Acceptance Runbook

## 1. Provide isolated staging systems

Prepare a staging deployment with non-production PostgreSQL/private-file storage and test-only:

- super-admin and limited-role accounts with MFA;
- Kripicard sandbox/test credentials and cards;
- Outlook or Gmail test mailbox;
- Telegram test bot and test user;
- non-real receipt, card, identity, and transaction data;
- ClamAV, reverse proxy/TLS, worker, backups, and runtime controls configured as production-like services.

Never use production credentials, customer data, real PAN/CVV, or real funds.

## 2. Configure the harness

Copy `acceptance/phase23-staging.example.json` outside source control and set the actual staging URL. Keep credentials only in environment variables:

```bash
export ACCEPTANCE_CONFIG_FILE=/secure/path/phase23-staging.json
export ACCEPTANCE_TARGET_CONFIRM=https://admin-staging.example.com
export ACCEPTANCE_ADMIN_EMAIL=acceptance-admin@example.com
export ACCEPTANCE_ADMIN_PASSWORD='from-secret-manager'
export ACCEPTANCE_ADMIN_TOTP='current-six-digit-code'
```

Run preflight before any test:

```bash
npm run acceptance:preflight
```

The safety guard rejects production-named targets, non-HTTPS remote targets, non-staging configuration, and missing exact target confirmation.

## 3. Execute and capture the required workflow

Use the UI/API normally—never modify the database—to complete every entry in `acceptance/phase23-live-evidence.example.json`. Copy it to the secure evidence directory, record redacted evidence references, and set a step to `passed` only after observing the intended result.

Exercise duplicate/replay safety deliberately using test data:

- repeat identical Telegram webhook update IDs;
- repeat safe client requests with the same idempotency key;
- force a provider timeout/ambiguous test result where the sandbox permits it;
- run overlapping sync workers and assignment/funding attempts;
- confirm no duplicate card creation, funding, transaction, notification, or outbox action occurs.

Set `noManualDatabaseModification` and `duplicateSafetyConfirmed` to true only when supported by retained evidence. Then set:

```bash
export ACCEPTANCE_LIVE_EVIDENCE_FILE=/secure/path/phase23-live-evidence.json
```

## 4. Run the suite

Local/simulated coverage:

```bash
npm run acceptance:simulated
```

Full staging gate:

```bash
npm run acceptance:staging
```

The staging runner executes every category, including the isolated restore drill and bounded load smoke, and writes redacted category logs plus a JSON result report to `ACCEPTANCE_EVIDENCE_DIR` (or `acceptance-evidence/`). Do not commit this directory.

## 5. Release decision

Phase 23 passes only when:

- every manifest category passes in staging mode;
- every required live workflow step has redacted evidence;
- the complete workflow uses no manual database modification;
- duplicate/replay attempts do not duplicate financial actions;
- all failures have been fixed and rerun;
- Phase 22 security scans and external penetration-test gates are closed.
