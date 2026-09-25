# Deploying AccAbad Admin (simple, single-admin)

This gets the panel running with Docker Compose using a **bundled Postgres**, and it
**skips ClamAV and the production rollout gates** for simplicity.

## What runs

`docker compose up` starts:

| Service | Role |
|---------|------|
| `postgres` | PostgreSQL 17 (data persists in the `accabad_postgres_data` volume) |
| `db-migrate` | One-shot: creates the DB schema, then exits |
| `accabad-admin` | The web panel (port 3000) |
| `accabad-worker` | Background jobs (email sync / OTP expiry / Telegram outbox) |
| `admin-bootstrap` | One-shot tool (profile `tools`) that creates the first admin |

## Prerequisites

- Docker Engine + Docker Compose v2

## 1. Configure `.env`

**Easiest:** run the setup script — it creates `.env` with a clean DB name (`accabad_admin`)
and freshly generated secrets:

```bash
./setup.sh
```

**Or manually:**

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

- `DATABASE_NAME` / `DATABASE_USER` — project-specific (a unique value like `accabad_863c34`
  avoids collisions on a shared Postgres).
- `DATABASE_PASSWORD` — **≥ 12 characters**.
- `APP_ENCRYPTION_KEY` — generate with `openssl rand -base64 32`. **Back this up**; losing it
  makes stored secrets unreadable.
- `APP_BASE_URL` — the **exact public URL** you use in the browser (e.g. `https://cards.example.com`). ⚠️ Must match the browser's scheme + host **exactly**, or login-protected actions (reauth, save bot token, etc.) fail with **"The request origin could not be verified."** After changing it, recreate the app containers: `docker compose up -d --force-recreate accabad-admin accabad-worker`.

Keep **`APP_ENV=staging`** for a simple deploy. Switching to `production` re-enforces
HTTPS-only URLs **and** fail-closed ClamAV scanning (which this lean setup removed).

Production also starts with the rollout gate blocked. Only when you intentionally want to unblock
production, set both values together:

```env
PRODUCTION_ROLLOUT_BLOCKED=false
PRODUCTION_ROLLOUT_AUTHORIZATION=ACCABAD_PRODUCTION_RELEASE_AUTHORIZED
```

Existing deployments that still use the old `PHASE24_RELEASE_AUTHORIZED` token remain accepted for
upgrade compatibility, but new deployments should use the AccAbad authorization value above.

## 2. Build and start

```bash
docker compose up -d --build
```

The schema is created **automatically** by the `db-migrate` step — you do **not** run
migrations manually. Watch it come up:

```bash
docker compose ps
docker compose logs -f accabad-admin
```

## 3. Create the first admin

```bash
docker compose --profile tools run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='you@example.com' \
  -e BOOTSTRAP_ADMIN_PASSWORD='a-strong-password-12+' \
  admin-bootstrap
```

`BOOTSTRAP_ADMIN_DISPLAY_NAME` is optional (defaults to “Super Admin”). This refuses to run if
an admin already exists.

## 4. Open the panel

<http://localhost:3000> — bound to `127.0.0.1` by default.

To reach it from another machine, either:

- put a reverse proxy (Caddy/Nginx) in front and set `APP_BASE_URL` to that public URL, **or**
- set `ACCABAD_BIND_IP=0.0.0.0` in `.env` to expose port 3000 directly (less safe).

## Health checks

- `http://localhost:3000/health` — liveness
- `http://localhost:3000/ready` — readiness + environment info

## Enabling real card creation / funding later

Provider writes are **OFF** by default (safe). When you're ready, set in `.env`:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
ENABLE_KRIPICARD_CARD_STATE_WRITES=true  # optional: freeze/unfreeze
ENABLE_KRIPICARD_CARD_CREATION=true      # optional: create first cards
ENABLE_KRIPICARD_CARD_FUNDING=true       # optional: fund cards
```

Enable only the operations you need, but keep the confirmation line whenever the master switch is
true. Then recreate the services so they receive the new environment:

```bash
docker compose up -d --force-recreate accabad-admin accabad-worker
```

Money-moving calls are **single-attempt (no auto-retry)** by design
to prevent double-spend.

## How card funding works

Think of card funding as two separate money movements:

1. **The customer pays you in IRR.** The bot calculates the exact IRR amount from the requested
   USD card amount, provider fee, service fee, and the current approved exchange rate.
2. **The customer has 5 minutes to upload the payment receipt.** If no receipt is received in that
   window, AccAbad cancels the unpaid funding request and its customer-payment record. A late
   receipt is rejected and the customer must start a new request.
3. **You review the receipt in Admin → Requests.** Accepting the receipt means only
   “the customer paid us”; it does not yet change the Kripicard card balance.
4. **Make sure the Kripicard account wallet has enough money.** If needed, use the account's
   wallet/deposit controls and wait until Kripicard shows the deposit.
5. **Click Fund card.** AccAbad performs one provider funding attempt for the accepted request.
6. If Kripicard confirms the operation, the request becomes **Completed**.
7. If the provider response is uncertain, AccAbad moves the request to reconciliation instead of
   blindly retrying. Check Kripicard first, then reconcile the result from the admin panel.

The 5-minute limit applies to the customer's **receipt submission**, not to how quickly an admin
must review an already submitted receipt.

## Connect Outlook / Hotmail or Gmail

AccAbad uses **one OAuth application per provider for the whole installation**. Do not create a
new Microsoft or Google OAuth application for every Kripicard account. Each AccAbad account
authorizes its own mailbox separately and stores its own encrypted refresh token.

### Microsoft Outlook / Hotmail

1. In `.env`, set:
   ```env
   MICROSOFT_OAUTH_CLIENT_ID=...
   MICROSOFT_OAUTH_CLIENT_SECRET=...
   MICROSOFT_OAUTH_TENANT=consumers
   ```
2. In Microsoft Entra, create a web application for AccAbad. The default `consumers` tenant is for
   personal Microsoft accounts such as Outlook.com and Hotmail. If you intentionally need
   Microsoft 365 work/school accounts too, configure the Entra application accordingly and use the
   appropriate tenant value.
3. Register this exact redirect URI, replacing the host with your `APP_BASE_URL`:
   ```text
   https://cards.example.com/api/v1/email/outlook/callback
   ```
4. Recreate the app and worker:
   ```bash
   docker compose up -d --force-recreate accabad-admin accabad-worker
   ```
5. In AccAbad, open **Accounts**, edit the Kripicard account, choose **Outlook / Hotmail**, and save.
   The mailbox field may be left blank.
6. Click **Connect Outlook**, sign in to the mailbox that belongs to that Kripicard account, and
   approve access. AccAbad records the mailbox identity returned by Microsoft.
7. Repeat only step 5–6 for every other Outlook/Hotmail mailbox. They all use the same OAuth
   application credentials but receive separate per-account tokens.
8. Run **Sync email** once after connecting to verify messages can be read.

If you pre-fill a mailbox address in AccAbad, OAuth must return that same address. This prevents
accidentally connecting the wrong Microsoft account.

### Gmail

1. In `.env`, set:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
2. In Google Cloud, enable the Gmail API, configure the OAuth consent screen, and create a web OAuth
   client.
3. Register this exact redirect URI:
   ```text
   https://cards.example.com/api/v1/email/gmail/callback
   ```
4. Recreate the app and worker.
5. In **Accounts**, choose **Gmail** for the Kripicard account and save. The mailbox field may be
   blank.
6. Click **Connect Gmail**, sign in to the correct mailbox, and approve read-only Gmail access.
7. Repeat the account-level connection for each Gmail mailbox.
8. Run **Sync email** once to verify the connection.

The admin panel also shows the exact redirect URI for each provider under
**Settings → Email OAuth setup**. Copy that value exactly; it is safer than typing it by hand.

## Common commands

```bash
docker compose ps          # status
docker compose logs -f     # follow logs
docker compose restart     # restart app + worker
docker compose down        # stop (keeps the data volume)
docker compose down -v     # stop AND delete the database volume
npm run db:status          # show applied migrations (requires compose up)
```

## Upgrading

```bash
git pull
docker compose up -d --build
```

Any new migrations apply automatically via `db-migrate` on startup.

## Troubleshooting

**Reverse proxy shows 502 immediately after enabling provider writes**
- Check `docker compose logs accabad-admin accabad-worker`. If environment validation reports
  `LIVE_PROVIDER_WRITE_CONFIRMATION`, add this exact line to `.env`:
  ```env
  LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
  ```
- Recreate both services with `docker compose up -d --force-recreate accabad-admin accabad-worker`.
- A 502 in this situation means the application rejected an incomplete live-write configuration
  and exited; it is not a Kripicard API response.

**"The request origin could not be verified."** (on reauth, save bot token, or any save action)
- `APP_BASE_URL` in `.env` does not match the URL in your browser's address bar. The CSRF check
  compares the browser `Origin` against `APP_BASE_URL`. Set it to the exact public URL
  (scheme + host, e.g. `https://cards.example.com`), then recreate the app containers:
  ```bash
  docker compose up -d --force-recreate accabad-admin accabad-worker
  ```

**Bot token saved but webhook won't configure / bot doesn't respond**
- `APP_BASE_URL` must be a public **HTTPS** URL with a valid certificate (Telegram requires it),
  and Telegram must be able to reach `APP_BASE_URL/api/telegram/webhook`. If a CDN/proxy
  (e.g. ArvanCloud) is in front, make sure it forwards to your origin and isn't blocking the path.

**Bot says "We couldn't process that document" when sending a KYC photo (uploads fail)**
- The container runs as the unprivileged `node` user (uid 1000), but the upload dirs under
  `./runtime-data/` are root-owned bind mounts, so writes are denied. Fix ownership and restart:
  ```bash
  sudo chown -R 1000:1000 ./runtime-data
  docker compose restart accabad-admin accabad-worker
  ```
