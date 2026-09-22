ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS onboarding_card_request_id uuid REFERENCES card_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_card_id uuid REFERENCES cards(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_users_onboarding_card_request_uq
  ON telegram_users(onboarding_card_request_id)
  WHERE onboarding_card_request_id IS NOT NULL;

INSERT INTO settings(key, typed_value)
VALUES ('onboarding_card_bin', to_json('539502'::text))
ON CONFLICT (key) DO NOTHING;
