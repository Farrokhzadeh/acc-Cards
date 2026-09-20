-- Phase 14: explicit Kripicard money-operation readiness gate.
-- This migration does NOT enable createcard, fundcard, deposit creation, or any other money-changing provider write.

CREATE TABLE IF NOT EXISTS provider_readiness_checks (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('wallet','deposit','card_create','card_fund','catalogue','capability','operations')),
  label text NOT NULL,
  requirement text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','partial','unresolved','not_applicable')),
  source_kind text NOT NULL CHECK (source_kind IN ('supplied_pdf','provider_written','live_test','official_public','none')),
  source_reference text,
  safe_note text,
  blocks_live_money boolean NOT NULL DEFAULT true,
  confirmed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'confirmed' AND source_kind <> 'none' AND source_reference IS NOT NULL) OR status <> 'confirmed')
);

CREATE TABLE IF NOT EXISTS provider_readiness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_key text NOT NULL REFERENCES provider_readiness_checks(key) ON DELETE RESTRICT,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  from_status text CHECK (from_status IS NULL OR from_status IN ('confirmed','partial','unresolved','not_applicable')),
  to_status text NOT NULL CHECK (to_status IN ('confirmed','partial','unresolved','not_applicable')),
  source_kind text NOT NULL CHECK (source_kind IN ('supplied_pdf','provider_written','live_test','official_public','none')),
  source_reference text,
  safe_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_readiness_events_check_created_idx
  ON provider_readiness_events(check_key, created_at DESC);

-- Facts established by the two supplied Kripicard PDFs.
INSERT INTO provider_readiness_checks(key,category,label,requirement,status,source_kind,source_reference,safe_note,blocks_live_money,confirmed_at) VALUES
  ('wallet_flow','wallet','Wallet-based payment flow','Confirm whether deposits credit an account wallet that is later debited by create/fund.','confirmed','supplied_pdf','Virtual Cards PDF pp.2-3; Deposits PDF pp.2-5','Supplied API is wallet-based. Direct crypto-to-card is not documented.',true,now()),
  ('deposit_order_id_idempotency','deposit','Deposit create idempotency','Confirm a caller-controlled idempotency/reconciliation identifier for deposit creation.','confirmed','supplied_pdf','Deposits PDF pp.2,4','order_id is documented as idempotent: reuse returns the same deposit.',true,now()),
  ('deposit_instruction_fields','deposit','Deposit payment instruction','Confirm returned address, exact crypto amount, network, expiry, fee, and net credit fields.','confirmed','supplied_pdf','Deposits PDF pp.4-5','Provider returns pay_address, pay_amount, pay_currency, network, expires_at, fee_usd and credited amounts.',true,now()),
  ('deposit_status_model','deposit','Deposit terminal statuses','Confirm deposit status values and credited amount semantics.','confirmed','supplied_pdf','Deposits PDF p.5','Documented statuses are pending, completed, failed; completed response includes credited and credited_amount_usd.',true,now()),
  ('fund_fee_formula_documented','card_fund','Documented fund-card fee formula','Record the fee model shown in the supplied card API contract.','confirmed','supplied_pdf','Virtual Cards PDF p.3','Supplied fundcard documentation states a fixed USD 1.00 plus 4% service fee.',false,now()),
  ('card_minimum_documented','card_create','Documented provider card minimum','Record the minimum amount shown in the supplied card API contract.','confirmed','supplied_pdf','Virtual Cards PDF pp.2-3','Supplied create/fund examples document a USD 10 minimum; AccAbad keeps its stricter configurable default.',false,now()),
  ('deposit_webhook_event_name','deposit','Deposit webhook event name','Confirm whether a deposit completion webhook exists.','partial','supplied_pdf','Deposits PDF p.2','deposit.completed is mentioned, but webhook registration, authentication, retries, ordering and delivery guarantees are not documented.',true,NULL),

  ('wallet_balance_endpoint','wallet','Live wallet balance endpoint','Obtain an authoritative production endpoint/contract for current account wallet balance, if one exists.','unresolved','none',NULL,'Do not display a fabricated live wallet balance.',true,NULL),
  ('production_rate_limits','operations','Production rate/concurrency limits','Obtain production rate limits, concurrency guidance, and 429 backoff expectations for the appapi contract.','unresolved','none',NULL,NULL,true,NULL),
  ('createcard_idempotency','card_create','Create-card idempotency/reconciliation','Obtain an idempotency key or authoritative reconciliation procedure for createcard, including pending/timeout outcomes.','unresolved','none',NULL,'Never blindly retry an ambiguous create-card write.',true,NULL),
  ('fundcard_idempotency','card_fund','Fund-card idempotency/reconciliation','Obtain an idempotency key or authoritative reconciliation procedure for fundcard after timeout/unknown outcomes.','unresolved','none',NULL,'Never blindly retry an ambiguous fund-card write.',true,NULL),
  ('production_fee_schedule','operations','Current production fee schedule','Confirm the current production create/fund/deposit fee schedule and whether it varies by account, BIN, coin or network.','unresolved','none',NULL,'Documentation examples are not treated as a forever price list.',true,NULL),
  ('live_bin_catalogue','catalogue','Live BIN/product catalogue','Obtain the current production BIN catalogue, availability rules, required DOB fields, and per-product capabilities.','unresolved','none',NULL,'The supplied PDF lists example BINs but no discovery endpoint.',true,NULL),
  ('deposit_webhook_contract','deposit','Deposit webhook security/delivery contract','Obtain webhook registration, signature verification, event ID, retry schedule, ordering, duplicate behavior, and delivery guarantees.','unresolved','none',NULL,NULL,true,NULL),
  ('deposit_underpayment_behavior','deposit','Deposit underpayment behavior','Confirm what happens when less than pay_amount arrives before expiry.','unresolved','none',NULL,NULL,true,NULL),
  ('deposit_overpayment_behavior','deposit','Deposit overpayment behavior','Confirm what happens when more than pay_amount arrives.','unresolved','none',NULL,NULL,true,NULL),
  ('deposit_late_payment_behavior','deposit','Late deposit behavior','Confirm what happens when funds arrive after expires_at, including reconciliation/refund rules.','unresolved','none',NULL,NULL,true,NULL),
  ('production_account_capabilities','capability','Production account capability differences','Confirm whether create/fund/deposit/freeze/BIN access differs by account tier or production account.','unresolved','none',NULL,NULL,true,NULL)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  requirement = EXCLUDED.requirement,
  blocks_live_money = EXCLUDED.blocks_live_money,
  updated_at = now();

INSERT INTO permissions(key, description) VALUES
  ('provider.readiness.read', 'View provider money-operation readiness checks and blockers.'),
  ('provider.readiness.manage', 'Record written/live provider confirmations for money-operation readiness checks.')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('provider.readiness.read','provider.readiness.manage')
WHERE r.name='super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key='provider.readiness.read'
WHERE r.name IN ('operator','finance_reviewer')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION accabad_reject_provider_readiness_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'provider_readiness_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS provider_readiness_events_immutable_update ON provider_readiness_events;
CREATE TRIGGER provider_readiness_events_immutable_update
BEFORE UPDATE OR DELETE ON provider_readiness_events
FOR EACH ROW EXECUTE FUNCTION accabad_reject_provider_readiness_event_mutation();
