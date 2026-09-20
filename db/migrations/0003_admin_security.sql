ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS mfa_confirmed_at timestamptz;

ALTER TABLE admin_sessions
  ADD COLUMN IF NOT EXISTS csrf_token_hash char(64),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_lower_uq ON admins ((lower(email)));
CREATE INDEX IF NOT EXISTS admin_sessions_admin_active_idx
  ON admin_sessions(admin_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('login_mfa')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_auth_challenges_admin_idx
  ON admin_auth_challenges(admin_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id bigserial PRIMARY KEY,
  email_hash char(64) NOT NULL,
  ip inet,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_attempts_email_created_idx
  ON admin_login_attempts(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_login_attempts_ip_created_idx
  ON admin_login_attempts(ip, created_at DESC)
  WHERE ip IS NOT NULL;

INSERT INTO permissions (key, description) VALUES
  ('dashboard.read', 'View the operational dashboard.'),
  ('accounts.read', 'View provider account metadata.'),
  ('clients.read', 'View Telegram client metadata.'),
  ('admins.manage', 'Manage administrative identities and access.'),
  ('security.mfa.manage', 'Configure MFA for the current administrator.')
ON CONFLICT (key) DO NOTHING;

-- Super admins receive every permission present now or added later by migration reruns.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Operators can perform ordinary day-to-day workflows but cannot reveal secrets or change global security.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key IN (
    'dashboard.read', 'accounts.read', 'accounts.manage', 'clients.read', 'clients.manage',
    'cards.read', 'cards.operate', 'funding.review', 'inbox.read'
  )
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

-- Finance reviewers get read access plus funding/reconciliation permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key IN (
    'dashboard.read', 'accounts.read', 'clients.read', 'cards.read', 'funding.review', 'funding.execute', 'audit.read'
  )
 WHERE r.name = 'finance_reviewer'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION accabad_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable_update ON audit_logs;
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION accabad_reject_audit_mutation();
