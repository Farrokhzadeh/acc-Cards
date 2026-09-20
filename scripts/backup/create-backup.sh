#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

backup_dir="${BACKUP_LOCAL_DIR:-/var/backups/accabad}"
data_dir="${ACCABAD_DATA_DIR:-$ROOT/runtime-data}"
retention_days="${BACKUP_LOCAL_RETENTION_DAYS:-14}"
remote_destination="${BACKUP_RCLONE_DESTINATION:-}"

[[ "$backup_dir" = /* && "$backup_dir" != "/" ]] || { echo "BACKUP_LOCAL_DIR must be an absolute non-root path" >&2; exit 2; }
[[ "$data_dir" = /* && "$data_dir" != "/" ]] || { echo "ACCABAD_DATA_DIR must be an absolute non-root path" >&2; exit 2; }
[[ "$retention_days" =~ ^[0-9]+$ ]] || { echo "BACKUP_LOCAL_RETENTION_DAYS must be a non-negative integer" >&2; exit 2; }

umask 077
mkdir -p "$backup_dir" "$data_dir/receipts" "$data_dir/support-attachments"
work_dir="$(mktemp -d "$backup_dir/.accabad-building.XXXXXX")"
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
artifact_name="accabad-${stamp}.tar.gz"
artifact_path="$backup_dir/$artifact_name"

echo "[accabad-backup] creating PostgreSQL dump"
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$work_dir/database.dump"

echo "[accabad-backup] archiving private file data"
tar --format=posix -C "$data_dir" -czf "$work_dir/private-files.tar.gz" receipts support-attachments

(
  cd "$work_dir"
  sha256sum database.dump private-files.tar.gz > SHA256SUMS
)
cat > "$work_dir/manifest.json" <<JSON
{
  "format": 1,
  "application": "AccAbad Admin",
  "applicationVersion": "${APP_VERSION:-phase21}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "contents": ["database.dump", "private-files.tar.gz", "SHA256SUMS"]
}
JSON

tar --format=posix -C "$work_dir" -czf "$artifact_path.tmp" manifest.json SHA256SUMS database.dump private-files.tar.gz
chmod 600 "$artifact_path.tmp"
mv "$artifact_path.tmp" "$artifact_path"
sha256sum "$artifact_path" > "$artifact_path.sha256"
chmod 600 "$artifact_path.sha256"

"$ROOT/scripts/backup/verify-backup.sh" "$artifact_path"

if [[ -n "$remote_destination" ]]; then
  command -v rclone >/dev/null || { echo "rclone is required when BACKUP_RCLONE_DESTINATION is set" >&2; exit 1; }
  remote_name="${remote_destination%%:*}"
  [[ "$remote_destination" == *:* && -n "$remote_name" ]] || { echo "BACKUP_RCLONE_DESTINATION must use rclone remote:path syntax" >&2; exit 2; }
  if ! rclone config show "$remote_name" | grep -Eq '^type = crypt$'; then
    echo "Refusing off-host upload: '$remote_name' must be an rclone crypt remote layered over MEGA." >&2
    exit 1
  fi
  echo "[accabad-backup] uploading verified encrypted copy to off-host storage"
  destination="${remote_destination%/}"
  rclone copyto "$artifact_path" "$destination/$artifact_name" --retries 3 --low-level-retries 10
  rclone copyto "$artifact_path.sha256" "$destination/$artifact_name.sha256" --retries 3 --low-level-retries 10
fi

if (( retention_days > 0 )); then
  find "$backup_dir" -maxdepth 1 -type f \( -name 'accabad-*.tar.gz' -o -name 'accabad-*.tar.gz.sha256' \) -mtime "+$retention_days" -delete
fi

echo "[accabad-backup] complete: $artifact_path"
