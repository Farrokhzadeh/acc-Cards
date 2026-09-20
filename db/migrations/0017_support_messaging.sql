-- Phase 18: production Telegram <-> admin support messaging.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unread_admin_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_client_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_client_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
    CHECK (status IN ('open','pending','closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS conversations_status_last_message_idx
  ON conversations(status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversations_unread_admin_idx
  ON conversations(unread_admin_count DESC, last_message_at DESC NULLS LAST)
  WHERE unread_admin_count > 0;
CREATE INDEX IF NOT EXISTS conversations_assigned_admin_idx
  ON conversations(assigned_admin_id, status, last_message_at DESC NULLS LAST);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS last_delivery_error text,
  ADD COLUMN IF NOT EXISTS delivery_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE TABLE IF NOT EXISTS support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  original_filename text,
  declared_mime_type text,
  detected_mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256_hex char(64) NOT NULL,
  scan_status text NOT NULL CHECK (scan_status IN ('clean','rejected','error')),
  scan_engine text,
  scan_note text,
  telegram_file_id text,
  telegram_file_unique_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_attachments_message_idx ON support_attachments(message_id);
CREATE INDEX IF NOT EXISTS support_attachments_sha_idx ON support_attachments(sha256_hex);

CREATE TABLE IF NOT EXISTS conversation_events (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('admin','telegram_user','system','worker')),
  actor_id uuid,
  event_type text NOT NULL,
  metadata_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_events_conversation_idx
  ON conversation_events(conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION accabad_block_conversation_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversation_events is append-only';
END $$;
DROP TRIGGER IF EXISTS conversation_events_no_update ON conversation_events;
CREATE TRIGGER conversation_events_no_update BEFORE UPDATE OR DELETE ON conversation_events
FOR EACH ROW EXECUTE FUNCTION accabad_block_conversation_event_mutation();

INSERT INTO permissions (key, description) VALUES
  ('messaging.manage', 'Assign, reopen, pend, or close support conversations.'),
  ('messaging.retry', 'Retry failed durable Telegram support deliveries.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin' AND p.key IN ('messaging.manage','messaging.retry')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key IN ('messaging.manage','messaging.retry')
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO settings (key, typed_value) VALUES
  ('support_allowed_attachment_types', '["application/pdf","image/jpeg","image/png","image/webp"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
