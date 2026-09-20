CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role_id uuid REFERENCES roles(id) ON DELETE RESTRICT,
  password_hash text,
  sso_subject text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (password_hash IS NOT NULL OR sso_subject IS NOT NULL)
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip inet,
  user_agent text,
  reauthenticated_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL UNIQUE,
  username text,
  display_name text,
  banned_at timestamptz,
  ban_reason text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kripi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  provider_account_ref text,
  login_email text NOT NULL,
  encrypted_password text NOT NULL,
  encrypted_api_key text NOT NULL,
  api_key_hint text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'attention', 'disabled', 'archived')),
  provider_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_balance_usd_cents bigint,
  account_balance_source text NOT NULL DEFAULT 'unavailable' CHECK (account_balance_source IN ('unavailable', 'provider', 'derived')),
  account_balance_as_of timestamptz,
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (account_balance_source <> 'unavailable' OR account_balance_usd_cents IS NULL)
);

CREATE UNIQUE INDEX kripi_accounts_provider_ref_uq
  ON kripi_accounts(provider_account_ref)
  WHERE provider_account_ref IS NOT NULL;

CREATE TABLE telegram_account_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL UNIQUE REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, account_id)
);

CREATE TABLE cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  provider_card_id text,
  last4 char(4),
  bin text,
  label text,
  cardholder_name text,
  card_email text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'active', 'frozen', 'closed', 'expired', 'attention')),
  balance_usd_cents bigint,
  balance_as_of timestamptz,
  expiry_month smallint CHECK (expiry_month IS NULL OR expiry_month BETWEEN 1 AND 12),
  expiry_year smallint,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cards_account_provider_card_uq
  ON cards(account_id, provider_card_id)
  WHERE provider_card_id IS NOT NULL;
CREATE INDEX cards_account_idx ON cards(account_id);
CREATE INDEX cards_status_idx ON cards(status);

CREATE TABLE card_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE RESTRICT,
  preferred_account_id uuid REFERENCES kripi_accounts(id) ON DELETE SET NULL,
  selected_account_id uuid REFERENCES kripi_accounts(id) ON DELETE SET NULL,
  bin text NOT NULL,
  initial_amount_usd_cents bigint NOT NULL CHECK (initial_amount_usd_cents > 0),
  name_on_card text NOT NULL,
  email text NOT NULL,
  date_of_birth date,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'correction_needed', 'issuing', 'issue_failed', 'needs_reconciliation', 'issued', 'rejected', 'cancelled')),
  admin_note text,
  provider_card_id text,
  reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_requests_user_status_idx ON card_requests(user_id, status);

CREATE TABLE exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rial_per_usd bigint NOT NULL CHECK (rial_per_usd > 0),
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  approved_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > effective_at)
);

CREATE TABLE funding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE RESTRICT,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  card_amount_usd_cents bigint NOT NULL CHECK (card_amount_usd_cents > 0),
  provider_fee_usd_cents bigint NOT NULL DEFAULT 0 CHECK (provider_fee_usd_cents >= 0),
  own_fee_usd_cents bigint NOT NULL DEFAULT 0 CHECK (own_fee_usd_cents >= 0),
  client_pays_usd_cents bigint NOT NULL CHECK (client_pays_usd_cents > 0),
  client_pays_rial bigint,
  rate_id uuid REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  rate_rial_per_usd bigint,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'correction_needed', 'accepted', 'funding', 'funding_failed', 'completed', 'rejected', 'cancelled')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_pays_usd_cents = card_amount_usd_cents + provider_fee_usd_cents + own_fee_usd_cents)
);
CREATE INDEX funding_requests_user_status_idx ON funding_requests(user_id, status);
CREATE INDEX funding_requests_card_idx ON funding_requests(card_id);

CREATE TABLE funding_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES funding_requests(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'telegram_user', 'system')),
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funding_request_events_request_idx ON funding_request_events(request_id, created_at);

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES funding_requests(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  original_filename text,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256_hex char(64) NOT NULL,
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'rejected', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE card_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid REFERENCES cards(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  card_request_id uuid REFERENCES card_requests(id) ON DELETE SET NULL,
  funding_request_id uuid REFERENCES funding_requests(id) ON DELETE SET NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('create', 'fund', 'freeze', 'unfreeze', 'delete')),
  amount_usd_cents bigint,
  provider_fee_usd_cents bigint,
  idempotency_key text NOT NULL UNIQUE,
  request_hash char(64) NOT NULL,
  provider_ref text,
  provider_status text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'needs_reconciliation')),
  provider_response_ref text,
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_operations_account_created_idx ON card_operations(account_id, created_at DESC);
CREATE INDEX card_operations_status_idx ON card_operations(status);

CREATE TABLE card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  provider_transaction_id text,
  fingerprint char(64),
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  transaction_type text,
  status text NOT NULL,
  merchant_redacted text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_transaction_id IS NOT NULL OR fingerprint IS NOT NULL)
);
CREATE UNIQUE INDEX card_transactions_provider_id_uq
  ON card_transactions(card_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX card_transactions_fingerprint_uq
  ON card_transactions(card_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX card_transactions_card_occurred_idx ON card_transactions(card_id, occurred_at DESC);

CREATE TABLE email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('outlook', 'gmail')),
  email_address text NOT NULL,
  encrypted_refresh_token text,
  encrypted_access_token text,
  token_expires_at timestamptz,
  connection_status text NOT NULL DEFAULT 'not_connected' CHECK (connection_status IN ('not_connected', 'connected', 'reauth_required', 'error', 'disabled')),
  provider_subject text,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, email_address)
);

CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id uuid NOT NULL REFERENCES email_accounts(id) ON DELETE RESTRICT,
  provider_message_id text NOT NULL,
  sender text NOT NULL,
  recipient text,
  subject text,
  preview text,
  body_text_ref text,
  body_html_ref text,
  category text NOT NULL DEFAULT 'normal' CHECK (category IN ('normal', 'verification', 'security', 'otp_3ds', 'quarantined')),
  parser_version text,
  received_at timestamptz NOT NULL,
  is_unread boolean NOT NULL DEFAULT true,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_account_id, provider_message_id)
);
CREATE INDEX email_messages_account_received_idx ON email_messages(email_account_id, received_at DESC);
CREATE INDEX email_messages_category_idx ON email_messages(category, received_at DESC);

CREATE TABLE otp_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE RESTRICT,
  card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  user_id uuid REFERENCES telegram_users(id) ON DELETE SET NULL,
  encrypted_code text NOT NULL,
  merchant_context text,
  expires_at timestamptz NOT NULL,
  delivered_at timestamptz,
  redacted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'expired', 'quarantined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES telegram_users(id) ON DELETE RESTRICT,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('client_to_admin', 'admin_to_client', 'system')),
  actor_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  text_body text,
  attachment_object_key text,
  telegram_message_id bigint,
  idempotent_send_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX messages_conversation_created_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE settings (
  key text PRIMARY KEY,
  typed_value jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'telegram_user', 'system', 'worker')),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_type, actor_id, created_at DESC);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  payload_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  result_ref text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (source, external_id)
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'needs_reconciliation')),
  result_ref text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, idempotency_key)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX outbox_events_pending_idx ON outbox_events(status, available_at) WHERE status IN ('pending', 'failed');

CREATE TABLE job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  job_key text,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'dead_letter')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  error_redacted text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX job_runs_type_started_idx ON job_runs(job_type, started_at DESC);
