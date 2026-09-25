import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");

test("admin dashboard never performs local demo mutations when the backend is unavailable", () => {
  assert.doesNotMatch(dashboard, /Demo card status updated/);
  assert.doesNotMatch(dashboard, /Demo message queued/);
  assert.doesNotMatch(dashboard, /keeping local demo data/i);
  assert.doesNotMatch(dashboard, /Account removed from the local demo/);
  assert.match(dashboard, /No local fallback data or actions will be used/);
  assert.match(dashboard, /Backend unavailable\. Card state was not changed/);
  assert.match(dashboard, /Backend unavailable\. The message was not queued/);
});

test("dashboard loads workflow data before operators visit each screen", () => {
  assert.match(dashboard, /view !== "overview" && view !== "requests"/);
  assert.match(dashboard, /view !== "requests" && view !== "clients"/);
  assert.match(dashboard, /fetchAllKycSubmissions/);
  assert.doesNotMatch(dashboard, /fetchKycSubmissions\(\{ limit: 200 \}\)/);
});

test("KYC list supports pagination and reviewed decisions are read-only", () => {
  assert.match(dashboard, /Load more submissions/);
  assert.match(dashboard, /selected\.status === "pending"/);
});

test("transaction summaries come from stored transactions", () => {
  assert.match(dashboard, /successfulVolume = matchingTransactions/);
  assert.match(dashboard, /declinedVolume = matchingTransactions/);
  assert.doesNotMatch(dashboard, /formatUsd\(338\.99\)/);
  assert.doesNotMatch(dashboard, /formatUsd\(9\.99\)/);
});

test("connected inbox input is optional and OAuth can discover the mailbox identity", () => {
  assert.doesNotMatch(dashboard, /accountForm\.mailbox\.trim\(\) \|\| accountForm\.owner\.trim\(\)/);
  assert.match(dashboard, /Connected inbox address/);
  assert.match(dashboard, /optional/);
  assert.match(dashboard, /Leave blank and click Connect/);
  assert.match(dashboard, /every connected account stores its own encrypted refresh token/);
});
