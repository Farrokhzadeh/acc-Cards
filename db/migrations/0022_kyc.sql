-- KYC (Know Your Customer): customer identity submissions collected via the Telegram bot
-- and reviewed from the admin panel.

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  date_of_birth date,
  country text NOT NULL,
  national_id text NOT NULL,
  phone text NOT NULL,
  document_object_key text,
  document_mime_type text,
  document_filename text,
  document_size_bytes bigint,
  document_sha256 char(64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_submissions_user_idx
  ON kyc_submissions(telegram_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS kyc_submissions_status_idx
  ON kyc_submissions(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS kyc_submissions_created_idx
  ON kyc_submissions(created_at DESC, id DESC);

-- Extend the bot state machine with the KYC conversational flow.
ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle', 'support',
    'card_request_amount', 'card_request_name', 'card_request_email',
    'card_request_dob', 'card_request_confirm',
    'funding_request_amount', 'funding_request_confirm', 'funding_request_receipt',
    'kyc_fullname', 'kyc_dob', 'kyc_country', 'kyc_national_id',
    'kyc_phone', 'kyc_document', 'kyc_confirm'
  ));

INSERT INTO permissions (key, description) VALUES
  ('kyc.read', 'View customer KYC submissions.'),
  ('kyc.review', 'Approve or reject customer KYC submissions.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin' AND p.key IN ('kyc.read', 'kyc.review')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key IN ('kyc.read', 'kyc.review')
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO settings (key, typed_value) VALUES
  ('kyc_enabled', 'true'::jsonb),
  ('kyc_autoprompt', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
