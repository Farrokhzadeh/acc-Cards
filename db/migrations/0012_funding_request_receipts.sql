-- Phase 13: production funding-request quotes, private receipt evidence, and review workflow.
-- Provider fundcard execution remains disabled.

CREATE SEQUENCE IF NOT EXISTS funding_request_reference_seq START WITH 100000;

ALTER TABLE funding_requests DROP CONSTRAINT IF EXISTS funding_requests_status_check;
ALTER TABLE funding_requests
  ADD CONSTRAINT funding_requests_status_check CHECK (status IN (
    'pending_receipt', 'pending_review', 'correction_needed', 'accepted',
    'funding', 'funding_failed', 'completed', 'rejected', 'cancelled'
  ));

ALTER TABLE funding_requests
  ADD COLUMN IF NOT EXISTS provider_fee_basis_points integer NOT NULL DEFAULT 400 CHECK (provider_fee_basis_points >= 0 AND provider_fee_basis_points <= 10000),
  ADD COLUMN IF NOT EXISTS provider_fee_fixed_usd_cents bigint NOT NULL DEFAULT 100 CHECK (provider_fee_fixed_usd_cents >= 0),
  ADD COLUMN IF NOT EXISTS service_fee_basis_points integer NOT NULL DEFAULT 0 CHECK (service_fee_basis_points >= 0 AND service_fee_basis_points <= 10000),
  ADD COLUMN IF NOT EXISTS quote_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE funding_request_events
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telegram_user_id uuid REFERENCES telegram_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'telegram' CHECK (source IN ('telegram', 'admin')),
  ADD COLUMN IF NOT EXISTS telegram_file_id text,
  ADD COLUMN IF NOT EXISTS telegram_file_unique_id text,
  ADD COLUMN IF NOT EXISTS detected_mime_type text,
  ADD COLUMN IF NOT EXISTS scan_engine text,
  ADD COLUMN IF NOT EXISTS scan_note text,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_request_active_unique
  ON receipts(request_id)
  WHERE scan_status IN ('pending', 'clean');
CREATE INDEX IF NOT EXISTS funding_requests_status_submitted_idx
  ON funding_requests(status, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS receipts_scan_status_idx
  ON receipts(scan_status, created_at ASC);

INSERT INTO settings(key, typed_value) VALUES
  ('funding_service_fee_basis_points', '250'::jsonb),
  ('funding_provider_fee_basis_points', '400'::jsonb),
  ('funding_provider_fee_fixed_usd_cents', '100'::jsonb),
  ('funding_quote_ttl_minutes', '30'::jsonb),
  ('funding_receipt_max_bytes', '10485760'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions(key, description) VALUES
  ('funding.read', 'View funding requests, quote snapshots, timelines, and receipt metadata.'),
  ('funding.review', 'Review receipt evidence and accept, reject, or request correction.'),
  ('funding.pricing.manage', 'Manage funding service fee, minimum, and approved manual exchange-rate snapshots.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('funding.read','funding.review','funding.pricing.manage')
WHERE r.name='super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('funding.read','funding.review')
WHERE r.name='operator'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('funding.read','funding.review')
WHERE r.name='finance_reviewer'
ON CONFLICT DO NOTHING;

ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle', 'support',
    'card_request_amount', 'card_request_name', 'card_request_email',
    'card_request_dob', 'card_request_confirm',
    'funding_request_amount', 'funding_request_confirm', 'funding_request_receipt'
  ));

CREATE OR REPLACE FUNCTION accabad_reject_funding_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'funding_request_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS funding_request_events_immutable_update ON funding_request_events;
CREATE TRIGGER funding_request_events_immutable_update
BEFORE UPDATE OR DELETE ON funding_request_events
FOR EACH ROW EXECUTE FUNCTION accabad_reject_funding_request_event_mutation();
