-- Phase 5: Kripicard read-only provider integration and synchronization state.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS provider_created_at timestamptz;

CREATE TABLE IF NOT EXISTS account_sync_state (
  account_id uuid PRIMARY KEY REFERENCES kripi_accounts(id) ON DELETE CASCADE,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_attempt_at timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO permissions (key, description) VALUES
  ('cards.sensitive.read', 'Reveal live PAN, expiry, and CVV from the provider after reauthentication.')
ON CONFLICT (key) DO NOTHING;

-- Sensitive card details are intentionally super-admin-only by default.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key = 'cards.sensitive.read'
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- The provider docs confirm wallet-based create/fund behavior. Keep that fact explicit
-- in configuration so later money phases cannot silently assume direct crypto-to-card.
INSERT INTO settings (key, typed_value) VALUES
  ('kripicard_payment_model', '"account_wallet"'::jsonb),
  ('kripicard_direct_crypto_card_funding_supported', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE SET typed_value = EXCLUDED.typed_value, updated_at = now();
