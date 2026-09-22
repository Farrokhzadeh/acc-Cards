set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/db/migrations}"

psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if (( ${#migrations[@]} == 0 )); then
  echo "[accabad-db] no migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  version="$(basename "$migration")"
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  escaped_migration=${migration//\'/\'\'}

  echo "[accabad-db] checking: $version"
  psql -X -v ON_ERROR_STOP=1 -v version="$version" -v checksum="$checksum" <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('accabad-schema-migrations'));
SELECT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = :'version'
) AS already_applied \gset
\if :already_applied
  SELECT checksum = :'checksum' AS checksum_ok
    FROM schema_migrations
   WHERE version = :'version' \gset
  \if :checksum_ok
    \echo '[accabad-db] already applied: ' :version
  \else
    \echo '[accabad-db] checksum mismatch: ' :version
    \quit 3
  \endif
\else
  \echo '[accabad-db] applying: ' :version
  \i '$escaped_migration'
  INSERT INTO schema_migrations(version, checksum) VALUES (:'version', :'checksum');
\endif
COMMIT;
SQL
done

echo "[accabad-db] migrations complete"
