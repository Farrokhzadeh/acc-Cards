#!/usr/bin/env bash
# One-time setup for AccAbad Admin.
# Creates .env with a clean DB name + freshly generated secrets (only if .env is absent).
set -euo pipefail

DB_NAME="${DATABASE_NAME:-accabad_admin}"

if [ -f .env ]; then
  echo "[setup] .env already exists - leaving it untouched."
else
  if [ -z "${APP_BASE_URL:-}" ]; then
    read -rp "[setup] Public URL of the panel (must EXACTLY match your browser address, e.g. https://cards.example.com) [http://localhost:3000]: " _url
    APP_BASE_URL="${_url:-http://localhost:3000}"
  fi
  echo "[setup] Creating .env (database: $DB_NAME, url: $APP_BASE_URL) with generated secrets..."
  DBPW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-30)"
  KEY="$(openssl rand -base64 32)"
  cat > .env <<EOF
APP_ENV=staging
APP_BASE_URL=${APP_BASE_URL:-http://localhost:3000}
APP_VERSION=phase24
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=info

DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=$DB_NAME
DATABASE_USER=$DB_NAME
DATABASE_PASSWORD=$DBPW
DATABASE_SSL_MODE=disable

APP_ENCRYPTION_KEY=$KEY

RECEIPT_REQUIRE_ANTIVIRUS=false
RECEIPTS_STORAGE_DIR=/var/lib/accabad/receipts
SUPPORT_ATTACHMENTS_STORAGE_DIR=/var/lib/accabad/support-attachments

ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_STATE_WRITES=false
ENABLE_KRIPICARD_CARD_CREATION=false
ENABLE_KRIPICARD_CARD_FUNDING=false

ACCABAD_DATA_DIR=./runtime-data
ACCABAD_BIND_IP=127.0.0.1
ACCABAD_PORT=3000
POSTGRES_BIND_IP=127.0.0.1
POSTGRES_PORT=5432
EOF
  chmod 600 .env
  echo "[setup] .env created. BACK UP the APP_ENCRYPTION_KEY - it encrypts stored secrets."
fi

# Ensure the upload/data dirs exist and are writable by the unprivileged container
# user (node, uid 1000). Without this, saving KYC documents, receipts, and support
# attachments fails with a permission error (the dirs are root-owned bind mounts).
mkdir -p "${ACCABAD_DATA_DIR:-./runtime-data}/receipts" "${ACCABAD_DATA_DIR:-./runtime-data}/support-attachments"
if ! chown -R 1000:1000 "${ACCABAD_DATA_DIR:-./runtime-data}" 2>/dev/null; then
  echo "[setup] note: run 'sudo chown -R 1000:1000 ${ACCABAD_DATA_DIR:-./runtime-data}' so the app can write uploads."
fi

echo
echo "[setup] Next steps:"
echo "  1) docker compose up -d --build"
echo "  2) docker compose --profile tools run --rm \\"
echo "       -e BOOTSTRAP_ADMIN_EMAIL='you@example.com' \\"
echo "       -e BOOTSTRAP_ADMIN_PASSWORD='a-strong-password-12+' \\"
echo "       admin-bootstrap"
echo "  3) open http://localhost:3000"
