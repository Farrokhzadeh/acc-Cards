-- Phase 11: production client/account assignment workflow and immutable assignment history.

CREATE TABLE IF NOT EXISTS telegram_account_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES kripi_accounts(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('assigned', 'unassigned')),
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_account_assignment_events_user_idx
  ON telegram_account_assignment_events(telegram_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS telegram_account_assignment_events_account_idx
  ON telegram_account_assignment_events(account_id, created_at DESC, id DESC);

-- Existing UNIQUE(account_id) on telegram_account_assignments remains the authoritative
-- database invariant: one Kripicard account can have at most one Telegram owner.

INSERT INTO permissions (key, description) VALUES
  ('clients.assign', 'Assign and unassign Kripicard accounts for Telegram clients.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key = 'clients.assign'
 WHERE r.name IN ('super_admin', 'operator')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION accabad_reject_assignment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'telegram_account_assignment_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS telegram_assignment_events_immutable ON telegram_account_assignment_events;
CREATE TRIGGER telegram_assignment_events_immutable
BEFORE UPDATE OR DELETE ON telegram_account_assignment_events
FOR EACH ROW EXECUTE FUNCTION accabad_reject_assignment_event_mutation();
