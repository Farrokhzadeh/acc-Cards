ALTER TABLE email_accounts
  ALTER COLUMN email_address DROP NOT NULL;

ALTER TABLE email_accounts
  DROP CONSTRAINT IF EXISTS email_accounts_provider_email_address_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_provider_email_address_uq
  ON email_accounts(provider, lower(email_address))
  WHERE email_address IS NOT NULL;
