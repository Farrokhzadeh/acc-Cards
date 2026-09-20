#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/path/accabad-YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
bundle="$1"
"$ROOT/scripts/backup/verify-backup.sh" "$bundle"

restore_dir="$(mktemp -d)"
test_db="accabad_restore_test_$(date +%s)_$$"
cleanup() {
  docker compose exec -T postgres sh -lc "dropdb -U \"\$POSTGRES_USER\" --if-exists '$test_db'" >/dev/null 2>&1 || true
  rm -rf -- "$restore_dir"
}
trap cleanup EXIT
tar -xzf "$bundle" -C "$restore_dir" database.dump

echo "[accabad-restore-test] restoring into temporary database $test_db"
docker compose exec -T postgres sh -lc "createdb -U \"\$POSTGRES_USER\" '$test_db'"
docker compose exec -T postgres sh -lc "pg_restore -U \"\$POSTGRES_USER\" -d '$test_db' --no-owner --no-acl" < "$restore_dir/database.dump"
docker compose exec -T postgres sh -lc "psql -X -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$test_db' -c 'SELECT count(*) AS applied_migrations FROM schema_migrations;'"
echo "[accabad-restore-test] database and private-file archive verification passed"
