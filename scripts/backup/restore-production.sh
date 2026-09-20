#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 || "$2" != "--confirm" || "$3" != "RESTORE_ACCABAD_PRODUCTION" ]]; then
  echo "usage: $0 /absolute/path/accabad-YYYYMMDDTHHMMSSZ.tar.gz --confirm RESTORE_ACCABAD_PRODUCTION" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
bundle="$1"
data_dir="${ACCABAD_DATA_DIR:-$ROOT/runtime-data}"
[[ "$data_dir" = /* && "$data_dir" != "/" ]] || { echo "ACCABAD_DATA_DIR must be an absolute non-root path" >&2; exit 2; }

"$ROOT/scripts/backup/verify-backup.sh" "$bundle"
restore_dir="$(mktemp -d)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
rollback_dir="$data_dir/pre-restore-$stamp"
cleanup() { rm -rf -- "$restore_dir"; }
trap cleanup EXIT
tar -xzf "$bundle" -C "$restore_dir"

echo "[accabad-restore] stopping application writers"
docker compose stop accabad-admin accabad-worker

echo "[accabad-restore] replacing PostgreSQL database"
docker compose exec -T postgres sh -lc 'dropdb -U "$POSTGRES_USER" --maintenance-db=postgres --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" --maintenance-db=postgres "$POSTGRES_DB"'
docker compose exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' < "$restore_dir/database.dump"

mkdir -p "$data_dir" "$rollback_dir"
for directory in receipts support-attachments; do
  if [[ -e "$data_dir/$directory" ]]; then mv "$data_dir/$directory" "$rollback_dir/$directory"; fi
done
tar -xzf "$restore_dir/private-files.tar.gz" -C "$data_dir"

echo "[accabad-restore] starting application and worker"
docker compose up -d accabad-admin accabad-worker
echo "[accabad-restore] complete; previous private files retained at $rollback_dir"
