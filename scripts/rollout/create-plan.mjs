import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readRolloutConfig, validateRolloutConfig } from "./config.mjs";

const { filename, config } = await readRolloutConfig();
const validation = validateRolloutConfig(config);
if (!validation.valid) throw new Error("Rollout configuration is invalid; run npm run rollout:validate.");
const plan = {
  releaseId: config.releaseId,
  strategy: config.strategy,
  productionOrigin: config.productionOrigin,
  authorized: validation.authorized,
  blockers: validation.blockers,
  safeguards: config.deploymentSafeguards,
  steps: [
    "Publish maintenance-window notice and confirm incident/rollback owners are present.",
    "Revalidate every evidence digest and approval; do not proceed while any blocker remains.",
    "Create and verify a fresh database/private-file backup and confirm off-host copy.",
    "Enter maintenance with PRODUCTION_ROLLOUT_BLOCKED=true, FORCE_READ_ONLY_MODE=true, and every integration/write ceiling disabled.",
    "Deploy the exact artifact digest and apply forward migrations once.",
    "Verify health, readiness, migration status, logs, alerts, backup access, and rollback artifact while the release lock remains active.",
    "At the approved opening time, set PRODUCTION_ROLLOUT_BLOCKED=false with the exact authorization phrase and remove forced read-only mode; keep live provider writes disabled.",
    "Open access to all users, observe error/latency/queue/security signals, and trigger rollback at any configured threshold.",
    "Enable email/Telegram only through their environment ceilings and runtime controls after observation is clean.",
    "Permit at most the configured initial money operations only after a separate operator decision; reconcile every operation against provider, database, and audit records.",
    "Close the window with a signed outcome report, or re-block production and execute rollback.",
  ],
};
const output = process.env.ROLLOUT_PLAN_OUTPUT?.trim();
if (output) {
  const destination = path.resolve(output);
  await writeFile(destination, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  console.log(destination);
} else {
  console.log(JSON.stringify({ configuration: filename, plan }, null, 2));
}
