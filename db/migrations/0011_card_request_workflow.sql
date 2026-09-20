-- Phase 12: production card-request workflow. Provider issuance remains disabled.

CREATE SEQUENCE IF NOT EXISTS card_request_reference_seq START WITH 100000;

CREATE TABLE IF NOT EXISTS card_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES card_requests(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('telegram_user', 'admin', 'system')),
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  telegram_user_id uuid REFERENCES telegram_users(id) ON DELETE SET NULL,
  note text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(COALESCE(note, '')) <= 1000)
);
CREATE INDEX IF NOT EXISTS card_request_events_request_created_idx
  ON card_request_events(request_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS card_requests_status_created_idx
  ON card_requests(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS card_requests_selected_account_idx
  ON card_requests(selected_account_id)
  WHERE selected_account_id IS NOT NULL;

-- Extend Telegram's conversational state machine for card requests.
ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle', 'support',
    'card_request_amount', 'card_request_name', 'card_request_email',
    'card_request_dob', 'card_request_confirm'
  ));

INSERT INTO permissions (key, description) VALUES
  ('card_requests.read', 'View card requests and their safe timeline.'),
  ('card_requests.review', 'Approve or reject pending card requests and select an assigned provider account.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin' AND p.key IN ('card_requests.read', 'card_requests.review')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key IN ('card_requests.read', 'card_requests.review')
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

-- These are the BINs explicitly present in the supplied Kripicard card API document.
-- DOB requirements are copied from that contract; this is not a dynamic BIN catalogue.
INSERT INTO settings (key, typed_value) VALUES
  ('card_request_bins', '[{"bin":"539502","requiresDob":false},{"bin":"525847","requiresDob":false},{"bin":"537872","requiresDob":true},{"bin":"533171","requiresDob":true},{"bin":"246001","requiresDob":true}]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION accabad_reject_card_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'card_request_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS card_request_events_immutable_update ON card_request_events;
CREATE TRIGGER card_request_events_immutable_update
BEFORE UPDATE OR DELETE ON card_request_events
FOR EACH ROW EXECUTE FUNCTION accabad_reject_card_request_event_mutation();
