-- Phase 16: guarded real card funding from accepted funding requests.
-- fundcard is a one-shot provider write. deposit/create remains disabled.

ALTER TABLE funding_requests DROP CONSTRAINT IF EXISTS funding_requests_status_check;
ALTER TABLE funding_requests
  ADD CONSTRAINT funding_requests_status_check CHECK (status IN (
    'pending_receipt', 'pending_review', 'correction_needed', 'accepted',
    'funding', 'funding_failed', 'needs_reconciliation', 'completed', 'rejected', 'cancelled'
  ));

ALTER TABLE funding_requests
  ADD COLUMN IF NOT EXISTS funding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS funded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fund_operation_id uuid REFERENCES card_operations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS card_fund_active_request_uq
  ON card_operations(funding_request_id)
  WHERE funding_request_id IS NOT NULL
    AND operation_type = 'fund'
    AND status IN ('created','pending','needs_reconciliation');

-- Serialize unresolved AccAbad funding writes per card. This does not claim provider-side
-- idempotency; it only prevents two local admins/jobs from funding the same card concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS card_fund_active_card_uq
  ON card_operations(card_id)
  WHERE card_id IS NOT NULL
    AND operation_type = 'fund'
    AND status IN ('created','pending','needs_reconciliation');

INSERT INTO permissions(key, description) VALUES
  ('funding.execute', 'Execute an accepted funding request through Kripicard and reconcile uncertain outcomes.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key='funding.execute'
WHERE r.name IN ('super_admin','finance_reviewer')
ON CONFLICT DO NOTHING;

-- The expanded provider docs now state the fund-card production formula directly.
UPDATE provider_readiness_checks SET
  status='confirmed', source_kind='supplied_pdf', source_reference='Virtual Cards PDF p.3',
  safe_note='fundcard documents a USD 1.00 fixed fee plus 4% and a USD 10 minimum. AccAbad keeps its stricter configurable minimum.',
  confirmed_at=now(), updated_at=now()
WHERE key='production_fee_schedule';

-- No caller-controlled idempotency key is documented for fundcard. The Overview purchase
-- contract defines the safe behavior instead: one write attempt, never auto-retry HTTP 202/
-- ambiguous outcomes, and reconcile using read-only evidence/provider support.
UPDATE provider_readiness_checks SET
  status='partial', source_kind='supplied_pdf', source_reference='Overview PDF pp.3-4; Virtual Cards PDF p.3',
  safe_note='No fundcard idempotency key is documented. AccAbad submits once, records the pre-write card state, never auto-retries uncertainty, and requires read-only reconciliation/provider confirmation.',
  blocks_live_money=false, confirmed_at=NULL, updated_at=now()
WHERE key='fundcard_idempotency';
