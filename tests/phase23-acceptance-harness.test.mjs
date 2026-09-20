import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSafeStagingTarget } from "../scripts/acceptance/safety.mjs";

const manifest = JSON.parse(await readFile(new URL("../acceptance/phase23-manifest.json", import.meta.url), "utf8"));
const evidence = JSON.parse(await readFile(new URL("../acceptance/phase23-live-evidence.example.json", import.meta.url), "utf8"));

test("Phase 23 manifest covers every required test category", () => {
  const categories = new Set(manifest.categories.map((category) => category.id));
  for (const required of ["unit", "database", "provider_contract", "integration", "end_to_end", "concurrency", "authorization", "resilience", "upload_security", "load", "backup_restore"]) {
    assert.equal(categories.has(required), true, `Missing category: ${required}`);
  }
  for (const category of manifest.categories) {
    assert.ok(category.command.length >= 2);
    assert.ok(category.modes.every((mode) => ["simulated", "staging"].includes(mode)));
  }
});

test("live evidence starts blocked and covers the complete required workflow", () => {
  assert.equal(evidence.noManualDatabaseModification, false);
  assert.equal(evidence.duplicateSafetyConfirmed, false);
  assert.equal(evidence.steps.length, 18);
  assert.ok(evidence.steps.every((step) => step.status === "blocked" && step.evidence === null));
  assert.equal(new Set(evidence.steps.map((step) => step.id)).size, evidence.steps.length);
});

test("staging target guard rejects production and requires exact operator confirmation", () => {
  const previous = process.env.ACCEPTANCE_TARGET_CONFIRM;
  try {
    process.env.ACCEPTANCE_TARGET_CONFIRM = "https://admin-production.example.com";
    assert.throws(
      () => assertSafeStagingTarget({ baseUrl: "https://admin-production.example.com", expectedAppEnvironment: "staging" }),
      /Refusing/,
    );
    process.env.ACCEPTANCE_TARGET_CONFIRM = "https://admin-staging.example.com";
    assert.equal(
      assertSafeStagingTarget({ baseUrl: "https://admin-staging.example.com", expectedAppEnvironment: "staging" }).origin,
      "https://admin-staging.example.com",
    );
  } finally {
    if (previous === undefined) delete process.env.ACCEPTANCE_TARGET_CONFIRM;
    else process.env.ACCEPTANCE_TARGET_CONFIRM = previous;
  }
});
