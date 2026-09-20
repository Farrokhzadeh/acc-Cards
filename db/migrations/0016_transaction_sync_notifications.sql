-- Phase 17: scheduled Kripicard transaction synchronization and deduplicated Telegram notifications.

CREATE TABLE IF NOT EXISTS transaction_sync_state (
  card_id uuid PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  baseline_completed boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- If an operator already synchronized transactions before Phase 17, that stored history is the
-- notification baseline. Otherwise the first scheduled sync intentionally establishes a baseline
-- without sending historical-transaction notifications.
INSERT INTO transaction_sync_state(card_id, baseline_completed, next_attempt_at)
SELECT c.id,
       EXISTS (SELECT 1 FROM card_transactions ct WHERE ct.card_id = c.id),
       now()
  FROM cards c
 WHERE c.archived_at IS NULL
ON CONFLICT (card_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS transaction_sync_state_due_idx
  ON transaction_sync_state(next_attempt_at, lease_until, last_succeeded_at);

ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS notification_status text NOT NULL DEFAULT 'not_queued'
    CHECK (notification_status IN ('not_queued', 'queued', 'sent', 'skipped', 'failed')),
  ADD COLUMN IF NOT EXISTS notification_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_error text,
  ADD COLUMN IF NOT EXISTS notification_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_reconciled_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notification_reconciliation_note text;

CREATE INDEX IF NOT EXISTS card_transactions_notification_status_idx
  ON card_transactions(notification_status, occurred_at DESC);

INSERT INTO settings(key, typed_value) VALUES
  ('telegram_transaction_notifications_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;


INSERT INTO permissions(key, description) VALUES
  ('transactions.reconcile', 'Acknowledge or safely retry transaction-notification delivery issues.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key='transactions.reconcile'
 WHERE r.name IN ('super_admin','operator')
ON CONFLICT DO NOTHING;
