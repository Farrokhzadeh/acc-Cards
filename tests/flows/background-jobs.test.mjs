import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("phase 19 migration provides PostgreSQL scheduled jobs and worker leases", () => {
  const sql = read("db/migrations/0018_background_jobs.sql");
  assert.match(sql, /CREATE TABLE scheduled_jobs/i);
  assert.match(sql, /lease_owner text/i);
  assert.match(sql, /lease_until timestamptz/i);
  assert.match(sql, /consecutive_failures/i);
  assert.match(sql, /max_attempts/i);
});

test("worker claims jobs with skip locked and records durable runs", () => {
  const source = read("server/jobs/runner.ts");
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /INSERT INTO job_runs/);
  assert.match(source, /next_retry_at/);
  assert.match(source, /status='dead_letter'|"dead_letter"/);
});

test("worker dispatches all phase 19 core recurring jobs", () => {
  const source = read("server/jobs/runner.ts");
  for (const type of ["kripicard_card_sync", "kripicard_transaction_sync", "outlook_sync", "gmail_sync", "email_classify", "telegram_outbox", "funding_request_expiry", "maintenance_expiry"]) {
    assert.ok(source.includes(type), `missing job type ${type}`);
  }
});

test("docker compose contains a separate worker service", () => {
  const compose = read("docker-compose.yml");
  assert.match(compose, /accabad-worker:/);
  assert.match(compose, /npm", "run", "worker/);
});


test("optional mailbox jobs may report skipped without poisoning worker retry state", () => {
  const gmail = read("server/providers/google/service.ts");
  const outlook = read("server/providers/microsoft/service.ts");
  assert.match(gmail, /skipped: true, reason: "google_not_configured"/);
  assert.match(outlook, /skipped: true, reason: "microsoft_not_configured"/);
});


test("funding request expiry is scheduled independently every 30 seconds", () => {
  const sql = read("db/migrations/0035_funding_request_expiry_job.sql");
  const source = read("server/jobs/runner.ts");
  assert.match(sql, /'funding-request-expiry', 'funding_request_expiry', 30, 8/);
  assert.match(source, /case "funding_request_expiry"/);
  assert.match(source, /expireStaleFundingRequests\(\)/);
  assert.match(source, /expired: expired\.length/);
});
