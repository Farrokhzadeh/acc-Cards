import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0008_email_classification_otp.sql", import.meta.url), "utf8");
const classifier = await readFile(new URL("../../server/email/classifier.ts", import.meta.url), "utf8");
const otpRoute = await readFile(new URL("../../app/api/v1/email/messages/[messageId]/otp/route.ts", import.meta.url), "utf8");
const rulesRoute = await readFile(new URL("../../app/api/v1/email/trusted-rules/route.ts", import.meta.url), "utf8");
const jobRoute = await readFile(new URL("../../app/api/internal/jobs/email-classify/route.ts", import.meta.url), "utf8");
const outlook = await readFile(new URL("../../server/providers/microsoft/service.ts", import.meta.url), "utf8");
const gmail = await readFile(new URL("../../server/providers/google/service.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../../config/env-schema.mjs", import.meta.url), "utf8");

test("Phase 9 adds trusted sender/template rules and classification state", () => {
  assert.match(migration, /email_trusted_rules/);
  assert.match(migration, /classification_status/);
  assert.match(migration, /trusted_rule_id/);
  assert.match(migration, /otp_deliveries_message_uq/);
});

test("OTP extraction uses fixed parser patterns rather than admin supplied regex", () => {
  assert.match(classifier, /extractOtpCandidate/);
  assert.match(classifier, /const contextual = normalized\.match/);
  assert.doesNotMatch(classifier, /new RegExp\(.*sender|new RegExp\(.*subject/s);
});

test("OTP values are encrypted, short lived, and redacted after expiry", () => {
  assert.match(classifier, /encryptSecret\(otpCandidate\)/);
  assert.match(classifier, /otpExpiryMinutes/);
  assert.match(classifier, /encrypted_code = ''/);
  assert.match(classifier, /redacted_at/);
});

test("untrusted OTP-like content is quarantined and never routed", () => {
  assert.match(classifier, /OTP-like content from an untrusted sender\/template/);
  assert.match(classifier, /category = 'quarantined'/);
});

test("routing hook contains only OTP reference metadata, not plaintext code", () => {
  assert.match(classifier, /otp\.ready_for_delivery/);
  const payloadLine = classifier.split("\n").find((line) => line.includes("JSON.stringify({ otpDeliveryId")) ?? "";
  assert.doesNotMatch(payloadLine, /otpCandidate|encrypted_code|code:/);
});

test("OTP reveal requires permission, CSRF, and recent reauthentication", () => {
  assert.match(otpRoute, /inbox\.otp\.reveal/);
  assert.match(otpRoute, /requireCsrf/);
  assert.match(otpRoute, /requireRecentReauthentication/);
  assert.doesNotMatch(otpRoute, /console\.log.*code/s);
});

test("trusted rule changes are permissioned", () => {
  assert.match(rulesRoute, /inbox\.rules\.manage/);
  assert.match(rulesRoute, /requireCsrf/);
});

test("Outlook and Gmail sync trigger classification after persistence", () => {
  assert.match(outlook, /classifyPendingEmailMessages/);
  assert.match(gmail, /classifyPendingEmailMessages/);
});

test("background classification hook is protected with a timing safe secret", () => {
  assert.match(jobRoute, /timingSafeEqual/);
  assert.match(jobRoute, /EMAIL_CLASSIFY_JOB_SECRET/);
  assert.match(env, /EMAIL_CLASSIFY_JOB_SECRET/);
});


test("trusted OTP classification accepts transient provider message text", () => {
  assert.match(classifier, /resolveMessageText/);
  assert.match(classifier, /provider_message_id/);
  assert.match(classifier, /if \(resolvedText\?\.trim\(\)\)/);
});
