import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateRolloutConfig } from "../scripts/rollout/config.mjs";

const example = JSON.parse(await readFile(new URL("../rollout/production-rollout.example.json", import.meta.url), "utf8"));
const environmentSchema = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");
const controls = await readFile(new URL("../server/operations/controls.ts", import.meta.url), "utf8");

test("blocked example is valid configuration but cannot authorize production", () => {
  const result = validateRolloutConfig(example);
  assert.equal(result.valid, true);
  assert.equal(result.authorized, false);
  assert.ok(result.blockers.some((blocker) => blocker.path === "gates.phase22ExternalPentest"));
  assert.ok(result.blockers.some((blocker) => blocker.path === "gates.phase23FullStagingAcceptance"));
});

test("rollout configuration is locked to an all-user maintenance window", () => {
  const invalid = structuredClone(example);
  invalid.strategy = "percentage_canary";
  assert.equal(validateRolloutConfig(invalid).valid, false);
  invalid.strategy = "maintenance_window_all_users";
  invalid.openingState.audience = "internal_users";
  assert.equal(validateRolloutConfig(invalid).valid, false);
});

test("credentials cannot be added to release configuration", () => {
  const invalid = structuredClone(example);
  invalid.password = "must-not-be-here";
  const result = validateRolloutConfig(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors[0].message, /forbidden/i);
});

test("production environment lock forces read-only and integration ceilings", () => {
  assert.match(environmentSchema, /PRODUCTION_ROLLOUT_BLOCKED: booleanFromEnv\.default\(true\)/);
  assert.match(environmentSchema, /PHASE24_RELEASE_AUTHORIZED/);
  assert.match(controls, /env\.APP_ENV === "production" && env\.PRODUCTION_ROLLOUT_BLOCKED/);
  assert.match(controls, /env\.FORCE_READ_ONLY_MODE \|\| rolloutBlocked/);
  assert.match(controls, /!rolloutBlocked && env\.ENABLE_TELEGRAM_SENDS/);
});
