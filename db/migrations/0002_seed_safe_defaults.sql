INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Full administrative access; sensitive actions still require reauthentication.'),
  ('operator', 'Day-to-day account, client, card, request, messaging, and inbox operations.'),
  ('finance_reviewer', 'Funding review, reconciliation, and finance-specific operations.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
  ('accounts.manage', 'Create, update, disable, and archive provider accounts.'),
  ('accounts.secrets.reveal', 'Reveal protected provider account secrets after reauthentication.'),
  ('clients.manage', 'Manage Telegram clients and account assignments.'),
  ('cards.read', 'View card metadata and provider-synchronized state.'),
  ('cards.operate', 'Run allowed provider card operations.'),
  ('funding.review', 'Review funding requests and receipts.'),
  ('funding.execute', 'Execute approved financial operations.'),
  ('inbox.read', 'Read connected Outlook/Gmail inboxes.'),
  ('configuration.manage', 'Manage product settings and integrations.'),
  ('audit.read', 'Read redacted immutable audit history.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, typed_value) VALUES
  ('platform_card_limit', '3'::jsonb),
  ('minimum_card_funding_usd_cents', '2000'::jsonb),
  ('minimum_card_creation_usd_cents', '2000'::jsonb),
  ('live_provider_writes_enabled', 'false'::jsonb),
  ('supported_email_providers', '["outlook", "gmail"]'::jsonb),
  ('account_balance_display_mode', '"unavailable"'::jsonb),
  ('contact_admin_text', '"Please contact an administrator to activate your account."'::jsonb)
ON CONFLICT (key) DO NOTHING;
