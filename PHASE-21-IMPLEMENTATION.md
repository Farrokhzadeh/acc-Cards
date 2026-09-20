# Phase 21 — Backup, Recovery, and Kill Switches

Phase 21 protects AccAbad's PostgreSQL and private file data and adds emergency controls that take effect without restarting the application.

## Implemented

- host-mounted receipt and support-attachment storage through `ACCABAD_DATA_DIR`
- verified backup bundles containing:
  - a PostgreSQL custom-format dump
  - private receipts
  - private support attachments
  - an internal SHA-256 manifest
- host-local backup retention through `BACKUP_LOCAL_DIR`
- optional off-host upload through an encrypted `rclone crypt` remote layered over MEGA
- daily systemd timer and service templates
- archive verification before any off-host upload
- isolated restore testing against a temporary PostgreSQL database
- guarded production restoration with an exact confirmation phrase and retained pre-restore private files
- migration recovery and disaster-recovery runbook
- database-backed runtime controls for:
  - all Kripicard writes
  - card creation
  - card funding
  - Telegram sends
  - Outlook synchronization
  - Gmail synchronization
  - application read-only mode
- deployment environment variables remain hard ceilings; a database control cannot enable a capability disabled by deployment configuration
- super-admin-only, recently reauthenticated control changes in the Operations screen
- append-only audit events for every control change
- read-only mode blocks API mutations and OAuth callbacks while preserving authentication, health views, and the control path needed to recover

## Safe defaults

Kripicard deployment write gates remain disabled by default. Runtime controls initialize enabled so they do not silently override deliberately enabled deployment gates. `FORCE_READ_ONLY_MODE=true` is an environment-level emergency override that the UI cannot undo.

Telegram and mailbox deployment ceilings default enabled for backward compatibility. Set any of these to `false` to create a hard deployment stop:

```env
ENABLE_TELEGRAM_SENDS=false
ENABLE_OUTLOOK_SYNC=false
ENABLE_GMAIL_SYNC=false
```

## Backup topology

Production should use absolute host paths:

```env
ACCABAD_DATA_DIR=/var/lib/accabad
BACKUP_LOCAL_DIR=/var/backups/accabad
BACKUP_LOCAL_RETENTION_DAYS=14
BACKUP_RCLONE_DESTINATION=accabad-mega-crypt:production
```

The `accabad-mega-crypt` remote must be an `rclone crypt` remote whose underlying remote is MEGA. The backup script rejects a direct, unencrypted remote.

## Exit criteria

- Production writes can be stopped from Operations without taking the admin panel offline.
- The deployment environment can impose stricter non-overridable limits.
- PostgreSQL and both private file stores are included in verified local and off-host backups.
- A backup can be restored into an isolated temporary database and its private-file archive can be validated.
- A guarded production restore procedure is documented and automated.

See `RECOVERY-RUNBOOK.md` for deployment and recovery commands.
