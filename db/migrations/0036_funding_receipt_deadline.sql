BEGIN;

ALTER TABLE funding_requests
  ADD COLUMN IF NOT EXISTS receipt_expires_at timestamptz;

UPDATE funding_requests
   SET receipt_expires_at = quote_expires_at
 WHERE status = 'pending_receipt'
   AND receipt_expires_at IS NULL
   AND quote_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS funding_requests_pending_receipt_deadline_idx
  ON funding_requests(receipt_expires_at)
  WHERE status = 'pending_receipt' AND receipt_expires_at IS NOT NULL;

COMMIT;
