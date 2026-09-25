ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS delivery_country text,
  ADD COLUMN IF NOT EXISTS delivery_province text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_address_line text,
  ADD COLUMN IF NOT EXISTS delivery_postal_code text;

ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle','support',
    'card_request_amount','card_request_name','card_request_email','card_request_dob','card_request_confirm','card_request_receipt',
    'funding_request_amount','funding_request_confirm','funding_request_receipt',
    'kyc_fullname','kyc_dob','kyc_country','kyc_national_id','kyc_phone',
    'kyc_delivery_country','kyc_delivery_province','kyc_delivery_city','kyc_delivery_address','kyc_delivery_postal',
    'kyc_document','kyc_confirm',
    'payment_receipt','payment_amount'
  ));

CREATE INDEX IF NOT EXISTS kyc_submissions_delivery_city_idx
  ON kyc_submissions(delivery_country, delivery_city)
  WHERE delivery_country IS NOT NULL AND delivery_city IS NOT NULL;
