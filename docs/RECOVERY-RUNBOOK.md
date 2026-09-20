# AccAbad Backup and Recovery Runbook

## 1. Prepare host storage

Create host directories that are outside the containers and readable only by the deployment administrator:

```bash
sudo install -d -o 1000 -g 1000 -m 0700 /var/lib/accabad/receipts
sudo install -d -o 1000 -g 1000 -m 0700 /var/lib/accabad/support-attachments
sudo install -d -m 0700 /var/backups/accabad
```

The supplied Node image uses UID/GID 1000 for its unprivileged `node` user; confirm that ownership if you substitute a different runtime image. The backup service runs as root so it can read both private directories while keeping them inaccessible to ordinary host users.

Set these absolute paths in `.env`:

```env
ACCABAD_DATA_DIR=/var/lib/accabad
BACKUP_LOCAL_DIR=/var/backups/accabad
BACKUP_LOCAL_RETENTION_DAYS=14
```

Keep `/var/backups/accabad` on a different disk or filesystem when practical. It remains a local recovery copy; MEGA supplies the off-host copy.

## 2. Configure encrypted MEGA storage

Install `rclone` on the host. Create a MEGA remote named `accabad-mega`, then layer an encrypted remote named `accabad-mega-crypt` over it:

```bash
rclone config
rclone config show accabad-mega-crypt
```

The second command must report `type = crypt`. Store the rclone configuration with root-only permissions and back up its crypt password separately. Losing the crypt password makes the off-host backups unrecoverable.

The backup bundle intentionally does not contain `APP_ENCRYPTION_KEY`, the rclone configuration, or the crypt password. Preserve those independently in a secret manager; losing them can make application secrets or off-host backup objects unrecoverable.

Set:

```env
BACKUP_RCLONE_DESTINATION=accabad-mega-crypt:production
```

Never point `BACKUP_RCLONE_DESTINATION` directly at the unencrypted MEGA remote. The script checks and rejects that configuration.

## 3. Create and verify a backup

```bash
npm run db:backup
```

The command creates a mode-0600 bundle in `BACKUP_LOCAL_DIR`, checks the outer checksum, verifies all internal checksums, confirms that the PostgreSQL dump is readable, validates archive paths, and then uploads through the encrypted MEGA remote.

Verify a downloaded or local bundle without restoring production:

```bash
bash scripts/backup/verify-backup.sh /var/backups/accabad/accabad-YYYYMMDDTHHMMSSZ.tar.gz
```

## 4. Schedule daily backups

Adjust `/opt/accabad` in the supplied unit if the repository is installed elsewhere, then run:

```bash
sudo install -m 0644 deploy/systemd/accabad-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/accabad-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now accabad-backup.timer
systemctl list-timers accabad-backup.timer
```

Review failures with:

```bash
journalctl -u accabad-backup.service
```

## 5. Run a restore drill

Run this regularly and after changes to PostgreSQL, storage paths, or backup tooling:

```bash
npm run db:restore-test -- /var/backups/accabad/accabad-YYYYMMDDTHHMMSSZ.tar.gz
```

The drill restores the dump into a temporary database, queries its migration history, validates the private archive, and removes the temporary database. It does not modify production data.

## 6. Emergency controls

Use **Operations → Emergency controls** for immediate runtime changes. Every change requires recent admin reauthentication, a reason, and is audited.

If the application UI is unavailable, impose a hard environment stop and restart the application and worker:

```env
FORCE_READ_ONLY_MODE=true
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_TELEGRAM_SENDS=false
ENABLE_OUTLOOK_SYNC=false
ENABLE_GMAIL_SYNC=false
```

```bash
docker compose up -d --force-recreate accabad-admin accabad-worker
```

An environment ceiling cannot be overridden from the Operations screen.

## 7. Production restoration

1. Confirm the chosen backup and its checksum.
2. Enable `FORCE_READ_ONLY_MODE=true` and recreate the application and worker, or stop them.
3. Preserve a copy of the current database and private files if incident conditions allow.
4. Run an isolated restore drill against the selected bundle.
5. Execute the guarded restore:

```bash
npm run db:restore -- /var/backups/accabad/accabad-YYYYMMDDTHHMMSSZ.tar.gz --confirm RESTORE_ACCABAD_PRODUCTION
```

The script stops application writers, replaces the PostgreSQL database, moves current private directories into a timestamped `pre-restore-*` directory, restores the selected private archive, and restarts the services. Do not delete the retained pre-restore directory until reconciliation is complete.

6. Keep read-only mode enabled while checking `/ready`, migrations, counts, recent transactions, assignments, and provider reconciliation queues.
7. Disable read-only mode only after the incident owner signs off.

## 8. Migration failure recovery

Migrations are forward-only. Do not improvise reverse SQL against financial history.

- If a migration fails before commit, fix the cause and rerun `db-migrate`; each migration is transaction-wrapped where PostgreSQL permits.
- If a migration committed but the new application is unhealthy, keep read-only mode on, capture incident evidence, and deploy a compatible fixed build.
- If the committed schema must be removed, restore the last verified pre-migration bundle rather than manually deleting columns or history.
- After restoration, reconcile all provider operations whose timestamps overlap the backup-to-incident window. Never replay uncertain `createcard` or `fundcard` operations automatically.
