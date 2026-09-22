set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ "${APP_ENV:-development}" == "production" ]]; then
  echo "Refusing to seed demo data when APP_ENV=production." >&2
  exit 1
fi

if [[ ! -f db/seeds/demo.sql ]]; then
  echo "db/seeds/demo.sql is missing." >&2
  exit 1
fi

docker compose exec -T postgres psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -U "${DATABASE_USER:-accabad}" \
  -d "${DATABASE_NAME:-accabad}" \
  < db/seeds/demo.sql

echo "Demo data seeded for ${APP_ENV:-development}."
