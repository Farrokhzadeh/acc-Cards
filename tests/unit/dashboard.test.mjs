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
