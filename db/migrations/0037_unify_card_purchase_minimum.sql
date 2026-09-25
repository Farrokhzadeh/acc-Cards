BEGIN;

INSERT INTO settings(key, typed_value)
VALUES ('payment_min_load_usd', '25'::jsonb)
ON CONFLICT (key) DO NOTHING;

DELETE FROM settings
WHERE key = 'minimum_card_creation_usd_cents';

COMMIT;
