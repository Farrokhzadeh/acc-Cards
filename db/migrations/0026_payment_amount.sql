-- Capture the amount the customer declared they paid (setup fee), so admins can
-- confirm it against the receipt / bank statement.
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS payment_amount_usd_cents bigint;

-- Allow the amount-collection bot state.
ALTER TABLE telegram_bot_states DROP CONSTRAINT IF EXISTS telegram_bot_states_mode_check;
ALTER TABLE telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_mode_check CHECK (mode IN (
    'idle', 'support',
    'card_request_amount', 'card_request_name', 'card_request_email',
    'card_request_dob', 'card_request_confirm',
    'funding_request_amount', 'funding_request_confirm', 'funding_request_receipt',
    'kyc_fullname', 'kyc_dob', 'kyc_country', 'kyc_national_id',
    'kyc_phone', 'kyc_document', 'kyc_confirm',
    'payment_receipt', 'payment_amount'
  ));
