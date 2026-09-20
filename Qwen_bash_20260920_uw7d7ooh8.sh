#!/usr/bin/env bash
set -euo pipefail

echo "🧹 Starting AccAbad-Cards cleanup..."

# 1. Remove useless Phase implementation logs
echo "Removing Phase implementation logs..."
rm -f PHASE-*-IMPLEMENTATION.md
rm -f AccAbad-Demo-to-Production-Phases.md

# 2. Organize remaining docs into a 'docs' folder
echo "Organizing remaining documentation..."
mkdir -p docs

# Move files only if they exist to avoid errors
[ -f KRIPICARD-PROVIDER-CONTRACT.md ] && mv KRIPICARD-PROVIDER-CONTRACT.md docs/
[ -f PROVIDER-READINESS-QUESTIONS.md ] && mv PROVIDER-READINESS-QUESTIONS.md docs/
[ -f RECOVERY-RUNBOOK.md ] && mv RECOVERY-RUNBOOK.md docs/

# 3. Write the new clean README.md
echo "Updating README.md..."
cat << 'EOF' > README.md
# AccAbad Admin

**Secure, multi-tenant card issuance and management platform.**

AccAbad is a production-grade admin panel and Telegram bot designed for high-security financial operations. It integrates with the Kripicard API for card issuance and funding, supports encrypted OAuth for email synchronization (Outlook/Gmail), and provides a durable, two-way support relay via Telegram.

## 🛡️ Security & Architecture

*   **Financial-Grade Safety:** Explicitly disables automatic retries for money-moving API calls (`createcard`, `fundcard`) to prevent double-spend scenarios.
*   **Hardened Containers:** All services run with `read_only: true`, `no-new-privileges`, and dropped capabilities (`cap_drop: ALL`).
*   **Encrypted Secrets:** Kripicard credentials, OAuth refresh tokens, and sensitive provider data are encrypted at rest using AES-256-GCM.
*   **Immutable Audit Logs:** Every state change (card issuance, funding, assignment) is recorded in an append-only timeline with redacted audit trails.
*   **Kill Switches:** Money-critical operations are gated behind environment variables (`ENABLE_KRIPICARD_CARD_CREATION`) and require recent admin re-authentication.

## ✨ Key Features

*   **Kripicard Integration:** Full lifecycle management (Create, Fund, Freeze/Unfreeze, Sync Transactions) with robust handling of ambiguous provider states (e.g., HTTP 202).
*   **Telegram Bot:** 
    *   Verified webhook with deduplication.
    *   Durable outbox for OTP delivery and transaction alerts.
    *   Private support relay with PDF/Image attachments (scanned by ClamAV).
*   **Email Sync:** 
    *   **Outlook/Hotmail:** Delegated OAuth via Microsoft Graph with delta sync.
    *   **Gmail:** Restricted `gmail.readonly` scope with history-based incremental sync.
*   **Operational Tooling:** 
    *   Verified host-local backups (Postgres + Receipts) with encrypted off-site upload (MEGA/rclone).
    *   Database-backed emergency controls and read-only modes.

## 🛠 Tech Stack

*   **Backend:** Node.js 22, TypeScript, Drizzle ORM
*   **Frontend:** React 19, Next.js (Vinext), Tailwind CSS
*   **Database:** PostgreSQL 17 (with custom checksum-verified migration runner)
*   **Infrastructure:** Docker, ClamAV (Malware Scanning)

## 🚀 Quick Start (Local)

1.  **Clone and Configure:**
    ```bash
    git clone https://github.com/Farrokhzadeh/AccAbad-Cards.git
    cd AccAbad-Cards
    cp .env.example .env
    ```

2.  **Generate Secrets:**
    Run this to generate a secure encryption key for your `.env`:
    ```bash
    openssl rand -base64 32
    ```

3.  **Start Services:**
    ```bash
    docker compose up -d --build
    ```

4.  **Bootstrap Admin User:**
    ```bash
    docker compose run --rm \
      -e BOOTSTRAP_ADMIN_EMAIL='admin@example.com' \
      -e BOOTSTRAP_ADMIN_PASSWORD='super-secret-password' \
      admin-bootstrap
    ```

## ⚙️ Configuration

### Core Settings
*   `APP_ENV`: Set to `staging` or `production`.
*   `APP_ENCRYPTION_KEY`: **Critical.** Used to encrypt database fields. Do not lose this.
*   `DATABASE_PASSWORD`: Postgres password.

### Provider Gates (Safety)
Keep these `false` until you have verified read-only connectivity.
```env
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_CREATION=false
ENABLE_KRIPICARD_CARD_FUNDING=false