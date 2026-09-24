CREATE TABLE IF NOT EXISTS kripicard_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  provider_deposit_id text NOT NULL,
  order_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','completed','failed')),
  amount_usd_cents bigint NOT NULL CHECK (amount_usd_cents > 0),
  fee_usd_cents bigint NOT NULL CHECK (fee_usd_cents >= 0),
  expected_credit_usd_cents bigint NOT NULL CHECK (expected_credit_usd_cents >= 0),
  credited_usd_cents bigint,
  currency text NOT NULL,
  network text NOT NULL,
  pay_address text NOT NULL,
  pay_amount text NOT NULL,
  expires_at timestamptz NOT NULL,
  credited_applied boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_deposit_id)
);

CREATE INDEX IF NOT EXISTS kripicard_deposits_account_created_idx
  ON kripicard_deposits(account_id, created_at DESC);

UPDATE provider_readiness_checks
SET status='confirmed', source_kind='supplied_pdf', confirmed_at=COALESCE(confirmed_at,now()), updated_at=now(),
    source_reference=CASE key
      WHEN 'production_rate_limits' THEN 'Overview PDF pp.2-3'
      WHEN 'live_bin_catalogue' THEN 'Virtual Cards PDF pp.2-3'
      WHEN 'purchase_202_contract' THEN 'Overview PDF pp.3-4'
      WHEN 'production_fee_schedule' THEN 'Virtual Cards PDF pp.2-3'
      ELSE source_reference
    END,
    safe_note=CASE key
      WHEN 'production_rate_limits' THEN 'The supplied contract documents separate read and purchase budgets and HTTP 429 metadata.'
      WHEN 'live_bin_catalogue' THEN 'The supplied contract lists the accepted virtual-card BINs and DOB requirements.'
      WHEN 'purchase_202_contract' THEN 'The supplied contract documents refunded pending responses and REFUND_PENDING behavior.'
      WHEN 'production_fee_schedule' THEN 'The supplied card-funding contract documents the fixed $1 plus 4% fee.'
      ELSE safe_note
    END
WHERE key IN ('production_rate_limits','live_bin_catalogue','purchase_202_contract','production_fee_schedule');
