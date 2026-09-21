-- Tracks when a customer declared "I've made the payment" (awaiting admin activation).
-- The full menu stays locked until an admin assigns an account (approval).
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS payment_declared_at timestamptz;
