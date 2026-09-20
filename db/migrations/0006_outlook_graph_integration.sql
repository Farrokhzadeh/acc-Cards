ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS provider_identity_email text,
  ADD COLUMN IF NOT EXISTS oauth_scope text,
  ADD COLUMN IF NOT EXISTS encrypted_sync_cursor text,
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz;

CREATE TABLE IF NOT EXISTS admin_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  admin_session_id uuid NOT NULL REFERENCES admin_sessions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES kripi_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('outlook')),
  state_hash char(64) NOT NULL UNIQUE,
  encrypted_pkce_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_oauth_states_active_idx
  ON admin_oauth_states(admin_id, expires_at DESC)
  WHERE consumed_at IS NULL;

INSERT INTO permissions (key, description) VALUES
  ('inbox.manage', 'Connect, reconnect, synchronize, or disconnect provider mailboxes.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key IN ('inbox.read', 'inbox.manage')
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;
