ALTER TABLE card_requests
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'customer';

ALTER TABLE card_requests DROP CONSTRAINT IF EXISTS card_requests_origin_check;
ALTER TABLE card_requests
  ADD CONSTRAINT card_requests_origin_check CHECK (origin IN ('customer','onboarding','admin_direct'));

UPDATE card_requests cr
   SET origin='onboarding'
  FROM telegram_users tu
 WHERE tu.onboarding_card_request_id=cr.id
   AND cr.origin='customer';

CREATE INDEX IF NOT EXISTS card_requests_origin_created_idx
  ON card_requests(origin,created_at DESC);

INSERT INTO permissions(key,description) VALUES
  ('cards.create_direct','Create cards directly for a customer without a customer request.'),
  ('clients.assign','Assign or unassign provider accounts from customers independently of onboarding.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
  FROM roles r
  JOIN permissions p ON p.key IN ('cards.create_direct','clients.assign')
 WHERE r.name IN ('super_admin','operator')
ON CONFLICT DO NOTHING;
