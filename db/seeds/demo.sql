BEGIN;

INSERT INTO kripi_accounts (
  id, label, login_email, encrypted_password, encrypted_api_key, api_key_hint,
  status, account_balance_usd_cents, account_balance_source, last_synced_at, created_at
) VALUES
  ('00000000-0000-4000-8000-000000000101', 'Primary Cards', 'accabad.primary.demo@outlook.com', 'DEMO_ONLY', 'DEMO_ONLY', '••••••••7KQ9', 'connected', NULL, 'unavailable', now() - interval '1 minute', now() - interval '30 days'),
  ('00000000-0000-4000-8000-000000000102', 'Media Operations', 'accabad.media.demo@gmail.com', 'DEMO_ONLY', 'DEMO_ONLY', '••••••••2PA4', 'connected', NULL, 'unavailable', now() - interval '4 minutes', now() - interval '24 days'),
  ('00000000-0000-4000-8000-000000000103', 'Reserve Pool', 'accabad.reserve.demo@hotmail.com', 'DEMO_ONLY', 'DEMO_ONLY', '••••••••8DW1', 'attention', NULL, 'unavailable', now() - interval '2 hours', now() - interval '40 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO telegram_users (id, telegram_user_id, username, display_name, banned_at, joined_at) VALUES
  ('00000000-0000-4000-8000-000000000201', 7421083921, 'amir_k', 'Amir Karimi', NULL, now() - interval '30 days'),
  ('00000000-0000-4000-8000-000000000202', 6049032158, 'sara_media', 'Sara Mirzaei', NULL, now() - interval '24 days'),
  ('00000000-0000-4000-8000-000000000203', 7832140097, 'nimarah', 'Nima Rahimi', NULL, now() - interval '13 days'),
  ('00000000-0000-4000-8000-000000000204', 5218004926, 'parsaa', 'Parsa Ahmadi', now() - interval '5 days', now() - interval '43 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO telegram_account_assignments (id, telegram_user_id, account_id, assigned_at) VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', now() - interval '18 days'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000103', now() - interval '35 days')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO cards (
  id, account_id, provider_card_id, last4, bin, label, cardholder_name, card_email,
  status, balance_usd_cents, expiry_month, expiry_year, synced_at, created_at
) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 'MR_A1B2C3D4', '4321', '539502', 'Subscriptions', 'Amir Karimi', 'amir.card.demo@outlook.com', 'active', 18850, 12, 2027, now(), now() - interval '18 days'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', 'VC_X9Y8Z7W6', '7890', '525847', 'Advertising', 'Amir Karimi', 'amir.ads.demo@outlook.com', 'frozen', 4200, 9, 2028, now(), now() - interval '15 days'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000102', 'MR_N8A1H55P', '1188', '537872', 'Meta Ads', 'Sara Mirzaei', 'sara.meta.demo@gmail.com', 'active', 82000, 2, 2029, now(), now() - interval '17 days'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000102', 'MR_R5P2L90Q', '6134', '533171', 'Google Ads', 'Sara Mirzaei', 'sara.google.demo@gmail.com', 'active', 31020, 6, 2029, now(), now() - interval '16 days'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000102', 'MR_T2N4D70L', '9044', '539502', 'Tools', 'Sara Mirzaei', 'sara.tools.demo@gmail.com', 'active', 7500, 1, 2029, now(), now() - interval '14 days'),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000103', 'MR_P3A9Q22V', '2207', '246001', 'General', 'Parsa Ahmadi', 'parsa.demo@hotmail.com', 'frozen', 1640, 11, 2028, now(), now() - interval '25 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_accounts (
  id, account_id, provider, email_address, connection_status, last_synced_at, created_at
) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', 'outlook', 'accabad.primary.demo@outlook.com', 'not_connected', NULL, now()),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000102', 'gmail', 'accabad.media.demo@gmail.com', 'not_connected', NULL, now()),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000103', 'outlook', 'accabad.reserve.demo@hotmail.com', 'not_connected', NULL, now())
ON CONFLICT (account_id) DO NOTHING;

COMMIT;
