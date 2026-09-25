import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0012_funding_request_receipts.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/funding/service.ts", import.meta.url), "utf8");
const receipts = await readFile(new URL("../../server/funding/receipts.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../../server/receipts/storage.ts", import.meta.url), "utf8");
const fileValidation = await readFile(new URL("../../server/security/file-validation.ts", import.meta.url), "utf8");
const antivirus = await readFile(new URL("../../server/receipts/antivirus.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const telegram = await readFile(new URL("../../server/providers/telegram/client.ts", import.meta.url), "utf8");
const transition = await readFile(new URL("../../app/api/v1/funding-requests/[id]/transition/route.ts", import.meta.url), "utf8");
const receiptRoute = await readFile(new URL("../../app/api/v1/funding-requests/[id]/receipt/route.ts", import.meta.url), "utf8");
const settingsRoute = await readFile(new URL("../../app/api/v1/funding-settings/route.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../../server/telegram/outbox.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const payments = await readFile(new URL("../../server/payments/service.ts", import.meta.url), "utf8");
const paymentMigration = await readFile(new URL("../../db/migrations/0030_customer_payments.sql", import.meta.url), "utf8");
const receiptDeadlineMigration = await readFile(new URL("../../db/migrations/0036_funding_receipt_deadline.sql", import.meta.url), "utf8");


test("Phase 13 adds funding quote snapshots and receipt workflow states", () => {
  assert.match(migration, /pending_receipt/);
  assert.match(migration, /provider_fee_basis_points/);
  assert.match(migration, /service_fee_basis_points/);
  assert.match(migration, /quote_expires_at/);
  assert.match(migration, /funding_request_reference_seq/);
});

test("funding quote uses immutable exchange-rate and fee snapshots with integer money arithmetic", () => {
  assert.match(service, /exchange_rates/);
  assert.match(service, /rateId/);
  assert.match(service, /providerFeeFixedUsdCents/);
  assert.match(service, /serviceFeeBasisPoints/);
  assert.match(service, /activeRate\(db,input\.quote\.rateId\)/);
  assert.match(service, /feeFor/);
  assert.match(service, /rialFor/);
  assert.doesNotMatch(service, /parseFloat/);
});

test("funding requests also populate the unified customer payment ledger", () => {
  assert.match(paymentMigration, /card_funding/);
  assert.match(service, /createCustomerPaymentInTransaction/);
  assert.match(service, /purpose: "card_funding"/);
  assert.match(service, /syncFundingPaymentStatus/);
  assert.match(receipts, /payment_id/);
  assert.match(payments, /funding_request_id/);
});

test("Telegram funding flow selects current owned card, snapshots quote, and requests receipt", () => {
  assert.match(bot, /fundreq\.card/);
  assert.match(bot, /funding_request_amount/);
  assert.match(bot, /funding_request_confirm/);
  assert.match(bot, /funding_request_receipt/);
  assert.match(bot, /previewFundingQuote/);
  assert.match(bot, /createTelegramFundingRequest/);
});

test("Telegram receipt support downloads provider file but limits size and accepted formats", () => {
  assert.match(telegram, /getFile/);
  assert.match(telegram, /downloadFile/);
  assert.match(receipts, /RECEIPT_MAX_BYTES/);
  assert.match(storage, /validatePrivateUpload/);
  assert.match(fileValidation, /application\/pdf/);
  assert.match(fileValidation, /image\/jpeg/);
  assert.match(fileValidation, /image\/png/);
  assert.match(fileValidation, /image\/webp/);
  assert.doesNotMatch(fileValidation, /video\//);
});


test("receipt malware scanning supports a fail-closed ClamAV deployment mode", () => {
  assert.match(antivirus, /zINSTREAM/);
  assert.match(antivirus, /RECEIPT_REQUIRE_ANTIVIRUS/);
  assert.match(antivirus, /receipt_malware_detected/);
  assert.match(antivirus, /receipt_antivirus_unavailable/);
  assert.match(storage, /scanReceiptForMalware/);
});

test("receipt storage is private and uses generated object keys rather than submitted filenames", () => {
  assert.match(storage, /RECEIPTS_STORAGE_DIR/);
  assert.match(storage, /randomToken\(24\)/);
  assert.match(storage, /path\.basename/);
  assert.match(storage, /mode: 0o700/);
  assert.match(storage, /"wx", 0o600/);
});

test("receipt validation and request transition commit atomically before admin review", () => {
  assert.match(receipts, /scan_status/);
  assert.match(receipts, /withTransaction/);
  assert.match(receipts, /markReceiptAttachedInTransaction/);
  assert.match(receipts, /deletePrivateReceipt/);
  assert.match(service, /receipt_not_clean/);
  assert.match(service, /pending_review/);
});

test("funding review writes require RBAC and CSRF and cannot execute provider funding", () => {
  assert.match(transition, /funding\.review/);
  assert.match(transition, /requireCsrf/);
  assert.match(transition, /accept/);
  assert.match(transition, /correction/);
  assert.match(transition, /reject/);
  assert.doesNotMatch(service, /\/api\/external\/cards\/fundcard/);
  assert.doesNotMatch(bot, /\/api\/external\/cards\/fundcard/);
});

test("receipt download is admin-only and forces attachment/no-sniff handling", () => {
  assert.match(receiptRoute, /funding\.read/);
  assert.match(receiptRoute, /content-disposition/);
  assert.match(receiptRoute, /x-content-type-options/);
  assert.match(receiptRoute, /sandbox/);
});

test("funding pricing settings create approved manual exchange-rate snapshots", () => {
  assert.match(settingsRoute, /funding\.pricing\.manage/);
  assert.match(settingsRoute, /requireCsrf/);
  assert.match(service, /manual_admin/);
  assert.match(service, /approved_by/);
  assert.match(service, /funding_service_fee_basis_points/);
});

test("review status changes are delivered through durable Telegram outbox", () => {
  assert.match(service, /funding_request\.status_changed/);
  assert.match(outbox, /deliverFundingRequestStatus/);
  assert.match(outbox, /funding_request\.status_changed/);
});

test("admin UI loads database funding requests and never exposes raw receipt object keys", () => {
  assert.match(dashboard, /fetchFundingRequests/);
  assert.match(dashboard, /reviewFundingRequest/);
  assert.match(dashboard, /fundingReceiptDownloadUrl/);
  assert.doesNotMatch(dashboard, /objectKey/);
  assert.match(dashboard, /Add account/);
});


test("funding request list supports server-side cursor pagination", () => {
  assert.match(service, /args\.cursor/);
  assert.match(service, /nextCursor/);
  assert.match(service, /submitted_at,fr\.id/);
});


test("requesting correction invalidates the previously accepted receipt before re-review", () => {
  assert.match(service, /correction_requested/);
  assert.match(service, /scan_status='rejected'/);
  assert.match(service, /receipt_not_clean/);
});


test("unpaid funding requests have a hard five minute receipt window", () => {
  assert.match(service, /FUNDING_RECEIPT_WINDOW_MS = 5 \* 60_000/);
  assert.match(service, /receiptExpiresAt = new Date\(Date\.now\(\) \+ FUNDING_RECEIPT_WINDOW_MS\)/);
  assert.match(bot, /funding_request_expired/);
});

test("stale funding requests are cancelled with their unified payment and removed from active work", () => {
  assert.match(service, /expireStaleFundingRequests/);
  assert.match(service, /status='pending_receipt'/);
  assert.match(service, /receipt_expires_at<=now\(\)/);
  assert.match(service, /SET status='cancelled',admin_note=\$2/);
  assert.match(service, /syncFundingPaymentStatus\(db, row\.id, "cancelled"/);
  assert.match(service, /Expired automatically after 5 minutes without a receipt/);
});

test("late funding receipts are rejected before Telegram downloads the file", () => {
  const expiryCheck = receipts.indexOf("await expireStaleFundingRequests(input.userId)");
  const telegramDownload = receipts.indexOf("await telegram.getFile");
  assert.ok(expiryCheck >= 0);
  assert.ok(telegramDownload > expiryCheck);
  assert.match(receipts, /funding_request_expired/);
  assert.match(receipts, /within 5 minutes/);
});


test("funding quote validity and receipt deadline are stored separately", () => {
  assert.match(receiptDeadlineMigration, /ADD COLUMN IF NOT EXISTS receipt_expires_at timestamptz/);
  assert.match(receiptDeadlineMigration, /status = 'pending_receipt'/);
  assert.match(receiptDeadlineMigration, /SET receipt_expires_at = quote_expires_at/);
  assert.match(receiptDeadlineMigration, /funding_requests_pending_receipt_deadline_idx/);
  assert.match(service, /quote_expires_at,receipt_expires_at/);
  assert.match(service, /quoteExpiresAt,receiptExpiresAt/);
  assert.match(service, /quoteExpiresAt: row\.quote_expires_at/);
  assert.match(service, /receiptExpiresAt: row\.receipt_expires_at/);
  assert.match(dashboard, /Receipt deadline/);
  assert.match(dashboard, /Original quote valid until/);
});
