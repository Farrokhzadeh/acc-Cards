CREATE SEQUENCE IF NOT EXISTS customer_payment_reference_seq START WITH 100000;

CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('first_card','additional_card','card_funding')),
  card_request_id uuid REFERENCES card_requests(id) ON DELETE RESTRICT,
  funding_request_id uuid REFERENCES funding_requests(id) ON DELETE RESTRICT,
  card_id uuid REFERENCES cards(id) ON DELETE RESTRICT,
  amount_usd_cents bigint NOT NULL CHECK (amount_usd_cents > 0),
  provider_fee_usd_cents bigint NOT NULL DEFAULT 0 CHECK (provider_fee_usd_cents >= 0),
  service_fee_usd_cents bigint NOT NULL DEFAULT 0 CHECK (service_fee_usd_cents >= 0),
  customer_pays_usd_cents bigint NOT NULL CHECK (customer_pays_usd_cents > 0),
  rate_id uuid NOT NULL REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  rate_rial_per_usd bigint NOT NULL CHECK (rate_rial_per_usd > 0),
  customer_pays_rial bigint NOT NULL CHECK (customer_pays_rial > 0),
  status text NOT NULL DEFAULT 'pending_receipt' CHECK (status IN (
    'pending_receipt','pending_review','correction_needed','accepted','rejected','completed','cancelled'
  )),
  receipt_id uuid,
  admin_note text,
  reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_pays_usd_cents = amount_usd_cents + provider_fee_usd_cents + service_fee_usd_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_payments_card_request_uq
  ON customer_payments(card_request_id) WHERE card_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_payments_funding_request_uq
  ON customer_payments(funding_request_id) WHERE funding_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_payments_user_created_idx
  ON customer_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_payments_status_idx
  ON customer_payments(status, created_at DESC);

ALTER TABLE receipts ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES customer_payments(id) ON DELETE RESTRICT;
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_parent_check;
ALTER TABLE receipts
  ADD CONSTRAINT receipts_parent_check CHECK (request_id IS NOT NULL OR payment_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_payment_active_unique
  ON receipts(payment_id) WHERE payment_id IS NOT NULL AND scan_status IN ('pending','clean');

ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_receipt_id_fkey;
ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL;

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS first_card_payment_id uuid REFERENCES customer_payments(id) ON DELETE SET NULL;

ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle','support',
    'card_request_amount','card_request_name','card_request_email','card_request_dob','card_request_confirm','card_request_receipt',
    'funding_request_amount','funding_request_confirm','funding_request_receipt',
    'kyc_fullname','kyc_dob','kyc_country','kyc_national_id','kyc_phone','kyc_document','kyc_confirm',
    'payment_receipt','payment_amount'
  ));

INSERT INTO permissions(key, description) VALUES
  ('payments.read', 'View customer payment records and receipt evidence.'),
  ('payments.review', 'Review customer payment receipt evidence.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('payments.read','payments.review')
WHERE r.name IN ('super_admin','finance_reviewer','operator')
ON CONFLICT DO NOTHING;
