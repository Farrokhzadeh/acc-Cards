-- Phase 6: guarded Kripicard freeze/unfreeze operations and reconciliation controls.

-- Only one unresolved state-changing operation may exist for a card at a time.
CREATE UNIQUE INDEX IF NOT EXISTS card_state_active_operation_uq
  ON card_operations(card_id)
  WHERE card_id IS NOT NULL
    AND operation_type IN ('freeze', 'unfreeze')
    AND status IN ('created', 'pending', 'needs_reconciliation');

INSERT INTO settings (key, typed_value) VALUES
  ('kripicard_card_state_writes_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
