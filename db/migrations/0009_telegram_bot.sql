-- Phase 10: Telegram webhook bot, opaque callbacks, force-join gates, support relay, and OTP delivery.

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

CREATE TABLE IF NOT EXISTS force_join_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  title text NOT NULL,
  invite_url text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS force_join_channels_enabled_idx
  ON force_join_channels(enabled, sort_order, created_at);

CREATE TABLE IF NOT EXISTS telegram_callback_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  single_use boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_callback_tokens_lookup_idx
  ON telegram_callback_tokens(token_hash, expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS telegram_callback_tokens_expiry_idx
  ON telegram_callback_tokens(expires_at);

CREATE TABLE IF NOT EXISTS telegram_bot_states (
  user_id uuid PRIMARY KEY REFERENCES telegram_users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('idle', 'support')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_inbound_telegram_message_uq
  ON messages(conversation_id, telegram_message_id)
  WHERE direction = 'client_to_admin' AND telegram_message_id IS NOT NULL;

ALTER TABLE otp_deliveries
  ADD COLUMN IF NOT EXISTS telegram_message_id bigint;

ALTER TABLE card_operations
  ADD COLUMN IF NOT EXISTS initiated_by_type text CHECK (initiated_by_type IS NULL OR initiated_by_type IN ('admin', 'telegram_user', 'system')),
  ADD COLUMN IF NOT EXISTS initiated_by_telegram_user_id uuid REFERENCES telegram_users(id) ON DELETE SET NULL;

INSERT INTO settings (key, typed_value) VALUES
  ('telegram_force_join_enabled', 'false'::jsonb),
  ('telegram_bot_menu_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
  ('telegram.manage', 'Inspect/configure the Telegram webhook and force-join channels.'),
  ('messaging.read', 'Read Telegram support conversations.'),
  ('messaging.send', 'Send support messages to Telegram clients.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin' AND p.key IN ('telegram.manage', 'messaging.read', 'messaging.send')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key IN ('messaging.read', 'messaging.send')
 WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;
