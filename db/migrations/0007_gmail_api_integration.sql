-- Phase 8: Gmail OAuth/API integration.
-- Expand one-time OAuth state storage to the second supported provider.

ALTER TABLE admin_oauth_states
  DROP CONSTRAINT IF EXISTS admin_oauth_states_provider_check;

ALTER TABLE admin_oauth_states
  ADD CONSTRAINT admin_oauth_states_provider_check
  CHECK (provider IN ('outlook', 'gmail'));

CREATE INDEX IF NOT EXISTS admin_oauth_states_provider_account_idx
  ON admin_oauth_states(provider, account_id, expires_at DESC)
  WHERE consumed_at IS NULL;
