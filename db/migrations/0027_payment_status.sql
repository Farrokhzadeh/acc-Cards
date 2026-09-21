-- Payment lifecycle for the activation payment (setup/load fee):
-- pending (receipt submitted) -> accepted (admin accepted receipt) -> complete (activated),
-- or denied (admin denied receipt, customer loops back).
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS payment_ucard_id uuid;
