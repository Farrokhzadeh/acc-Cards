-- Phase 9: trusted email classification and secure OTP/3DS extraction.

CREATE TABLE IF NOT EXISTS email_trusted_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sender_match text NOT NULL,
  subject_contains text,
  category text NOT NULL CHECK (category IN ('verification', 'security', 'otp_3ds')),
  otp_expiry_minutes integer NOT NULL DEFAULT 10 CHECK (otp_expiry_minutes BETWEEN 1 AND 60),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_match, subject_contains, category)
);
CREATE INDEX IF NOT EXISTS email_trusted_rules_enabled_idx ON email_trusted_rules(enabled, category);

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'quarantined', 'ignored')),
  ADD COLUMN IF NOT EXISTS classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS trusted_rule_id uuid REFERENCES email_trusted_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parser_note text;

CREATE INDEX IF NOT EXISTS email_messages_classification_idx
  ON email_messages(classification_status, received_at DESC);

ALTER TABLE otp_deliveries
  ADD COLUMN IF NOT EXISTS code_last2 char(2),
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS assignment_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_sender text,
  ADD COLUMN IF NOT EXISTS source_subject text;

CREATE UNIQUE INDEX IF NOT EXISTS otp_deliveries_message_uq
  ON otp_deliveries(email_message_id);

INSERT INTO permissions (key, description) VALUES
  ('inbox.rules.manage', 'Manage allowlisted sender/template rules used for verification and OTP classification.'),
  ('inbox.otp.reveal', 'Reveal a short-lived parsed OTP after recent reauthentication.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin' AND p.key IN ('inbox.rules.manage', 'inbox.otp.reveal')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'inbox.otp.reveal'
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;
