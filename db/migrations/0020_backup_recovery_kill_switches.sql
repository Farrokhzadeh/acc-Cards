BEGIN;

INSERT INTO permissions (key, description) VALUES
  ('operations.controls.manage', 'Change emergency runtime controls and read-only mode.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key = 'operations.controls.manage'
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

CREATE TABLE runtime_controls (
  control_key text PRIMARY KEY CHECK (control_key IN (
    'provider_writes',
    'card_creation',
    'card_funding',
    'telegram_sends',
    'outlook_sync',
    'gmail_sync',
    'read_only_mode'
  )),
  enabled boolean NOT NULL,
  reason text NOT NULL DEFAULT 'Phase 21 safe default',
  updated_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO runtime_controls(control_key, enabled, reason) VALUES
  ('provider_writes', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('card_creation', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('card_funding', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('telegram_sends', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('outlook_sync', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('gmail_sync', true, 'Runtime gate initialized; deployment environment remains the hard ceiling.'),
  ('read_only_mode', false, 'Normal read/write operation.')
ON CONFLICT (control_key) DO NOTHING;

COMMIT;
