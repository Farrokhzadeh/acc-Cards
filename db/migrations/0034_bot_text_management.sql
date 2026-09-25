CREATE TABLE IF NOT EXISTS bot_text_overrides (
  key text PRIMARY KEY,
  en_text text NOT NULL,
  fa_text text NOT NULL,
  image_bytes bytea,
  image_mime_type text,
  image_filename text,
  updated_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (image_bytes IS NULL AND image_mime_type IS NULL AND image_filename IS NULL)
    OR
    (image_bytes IS NOT NULL AND image_mime_type IS NOT NULL)
  )
);

INSERT INTO permissions (key, description) VALUES
  ('bot_texts.read', 'View Telegram bot text and media configuration.'),
  ('bot_texts.manage', 'Edit Telegram bot text and media configuration.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key IN ('bot_texts.read','bot_texts.manage')
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key = 'bot_texts.read'
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;
