-- Phase 15: guarded real card issuance from approved card requests.
-- createcard is a one-shot provider write. fundcard and deposit/create remain disabled.

ALTER TABLE card_operations
  ADD COLUMN IF NOT EXISTS safe_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_http_status integer,
  ADD COLUMN IF NOT EXISTS retry_after_seconds integer;

ALTER TABLE card_requests
  ADD COLUMN IF NOT EXISTS issuance_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_issue_operation_id uuid REFERENCES card_operations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS card_create_active_request_uq
  ON card_operations(card_request_id)
  WHERE card_request_id IS NOT NULL
    AND operation_type = 'create'
    AND status IN ('created','pending','needs_reconciliation');

INSERT INTO permissions(key, description) VALUES
  ('card_requests.issue', 'Issue an approved card request through Kripicard and reconcile uncertain outcomes.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key='card_requests.issue'
WHERE r.name IN ('super_admin','operator')
ON CONFLICT DO NOTHING;

-- Overview PDF page 4 is a current documented BIN catalogue. DOB remains required only
-- for the US/Singapore/UK BINs documented by the Virtual Cards contract.
INSERT INTO settings(key, typed_value) VALUES
  ('card_request_bins', '[
    {"bin":"539502","requiresDob":false},
    {"bin":"525847","requiresDob":false},
    {"bin":"539578","requiresDob":false},
    {"bin":"525797","requiresDob":false},
    {"bin":"235019","requiresDob":false},
    {"bin":"223600","requiresDob":false},
    {"bin":"238003","requiresDob":false},
    {"bin":"537872","requiresDob":true},
    {"bin":"533171","requiresDob":true},
    {"bin":"246001","requiresDob":true}
  ]'::jsonb)
ON CONFLICT (key) DO UPDATE SET typed_value=EXCLUDED.typed_value, updated_at=now();

-- New supplied Overview documentation answers rate-limit, purchase-202 and BIN-catalogue questions.
UPDATE provider_readiness_checks SET
  status='confirmed', source_kind='supplied_pdf', source_reference='Overview PDF pp.2-3',
  safe_note='Limits are per API key. Responses expose RateLimit-Limit/Remaining; HTTP 429 provides scope and Retry-After. Reads and purchases use separate budgets.',
  confirmed_at=now(), updated_at=now()
WHERE key='production_rate_limits';

UPDATE provider_readiness_checks SET
  status='confirmed', source_kind='supplied_pdf', source_reference='Overview PDF p.4',
  safe_note='Documented BIN catalogue: 539502,525847,539578,525797,235019,223600,238003,537872,533171,246001.',
  confirmed_at=now(), updated_at=now()
WHERE key='live_bin_catalogue';

INSERT INTO provider_readiness_checks(key,category,label,requirement,status,source_kind,source_reference,safe_note,blocks_live_money,confirmed_at)
VALUES (
  'purchase_202_contract','operations','Purchase HTTP 202 contract',
  'Confirm whether HTTP 202/pending purchase responses are safe to retry and how REFUND_PENDING differs.',
  'confirmed','supplied_pdf','Overview PDF pp.3-4',
  'HTTP 202 pending is never success and must never be auto-retried. No-code 202 says already refunded; REFUND_PENDING says currently charged while provider support resolves the refund.',
  true,now()
)
ON CONFLICT (key) DO UPDATE SET
  status=EXCLUDED.status, source_kind=EXCLUDED.source_kind, source_reference=EXCLUDED.source_reference,
  safe_note=EXCLUDED.safe_note, confirmed_at=EXCLUDED.confirmed_at, updated_at=now();

-- The contract still does not expose caller-controlled idempotency for createcard. Phase 15
-- therefore uses one provider attempt plus cards/list reconciliation. The missing key remains
-- explicit, but it no longer blocks card_create because the supplied 202 contract defines the
-- safe no-retry behavior.
UPDATE provider_readiness_checks SET
  status='partial', source_kind='supplied_pdf', source_reference='Overview PDF pp.3-4; Virtual Cards PDF p.2',
  safe_note='No createcard idempotency key is documented. AccAbad uses a one-shot createcard attempt, never auto-retries uncertain writes, and reconciles with cards/list.',
  blocks_live_money=false, confirmed_at=NULL, updated_at=now()
WHERE key='createcard_idempotency';
