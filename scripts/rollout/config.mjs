import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const requiredGates = [
  "phase22DependencyScan",
  "phase22SecretScan",
  "phase22ExternalPentest",
  "phase23FullStagingAcceptance",
  "freshBackupVerified",
  "isolatedRestoreDrill",
  "monitoringAndAlerts",
  "providerReconciliationReady",
];
export const requiredApprovals = ["applicationOwner", "securityReviewer", "operationsOwner"];

function sensitiveKeyPath(value, prefix = "") {
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (/^(password|secret|token|authorizationHeader|privateKey|cvv|cvc|pan)$/i.test(key)) return keyPath;
    const nested = sensitiveKeyPath(item, keyPath);
    if (nested) return nested;
  }
  return null;
}

export function rolloutConfigPath(argv = process.argv) {
  const argument = argv.find((value) => value.startsWith("--config="));
  return path.resolve(argument?.slice("--config=".length) || process.env.ROLLOUT_CONFIG_FILE || path.join(projectRoot, "rollout/production-rollout.example.json"));
}

export async function readRolloutConfig(argv = process.argv) {
  const filename = rolloutConfigPath(argv);
  return { filename, config: JSON.parse(await readFile(filename, "utf8")) };
}

export function validateRolloutConfig(config, options = {}) {
  const errors = [];
  const blockers = [];
  const addError = (path, message) => errors.push({ path, message });
  const addBlocker = (path, message) => blockers.push({ path, message });

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, authorized: false, errors: [{ path: "$", message: "Configuration must be an object." }], blockers: [] };
  }
  const sensitive = sensitiveKeyPath(config);
  if (sensitive) addError(sensitive, "Credentials and sensitive card data are forbidden in rollout configuration.");
  if (config.schemaVersion !== 1) addError("schemaVersion", "Must be 1.");
  if (!/^[a-z0-9][a-z0-9._-]{5,100}$/i.test(config.releaseId ?? "")) addError("releaseId", "Use a stable 6-100 character release identifier.");
  if (config.strategy !== "maintenance_window_all_users") addError("strategy", "Phase 24 is locked to maintenance_window_all_users.");

  try {
    const origin = new URL(config.productionOrigin);
    if (origin.protocol !== "https:" || origin.origin !== config.productionOrigin || /localhost|127\.0\.0\.1|stage|staging|test|sandbox/i.test(origin.hostname)) {
      addError("productionOrigin", "Use an exact production HTTPS origin, not localhost/staging/test/sandbox.");
    }
  } catch { addError("productionOrigin", "Must be a valid URL origin."); }

  if (config.release?.version !== "0.24.0") addError("release.version", "Must be 0.24.0 for this artifact.");
  for (const field of ["artifactSha256", "previousArtifactSha256"]) {
    const value = config.release?.[field];
    if (value === null || value === undefined || value === "") addBlocker(`release.${field}`, "A verified artifact SHA-256 is required for authorization.");
    else if (!/^[a-f0-9]{64}$/i.test(value)) addError(`release.${field}`, "Must be a 64-character SHA-256 digest.");
  }
  if (!config.release?.changeReference) addBlocker("release.changeReference", "An approved change reference is required.");

  const start = config.maintenanceWindow?.startsAt ? Date.parse(config.maintenanceWindow.startsAt) : NaN;
  const end = config.maintenanceWindow?.endsAt ? Date.parse(config.maintenanceWindow.endsAt) : NaN;
  if (!Number.isFinite(start)) addBlocker("maintenanceWindow.startsAt", "Schedule an ISO-8601 start time.");
  if (!Number.isFinite(end)) addBlocker("maintenanceWindow.endsAt", "Schedule an ISO-8601 end time.");
  if (Number.isFinite(start) && Number.isFinite(end)) {
    if (end <= start) addError("maintenanceWindow", "End must be after start.");
    if (end - start > 4 * 60 * 60 * 1000) addError("maintenanceWindow", "The maintenance window may not exceed four hours.");
  }
  if (config.maintenanceWindow?.timezone !== "UTC") addError("maintenanceWindow.timezone", "Use UTC for an unambiguous release window.");
  if (!config.maintenanceWindow?.noticeReference) addBlocker("maintenanceWindow.noticeReference", "A user notice reference is required.");

  for (const gate of requiredGates) {
    const item = config.gates?.[gate];
    if (!item || !["blocked", "passed", "failed"].includes(item.status)) addError(`gates.${gate}.status`, "Use blocked, passed, or failed.");
    if (item?.status !== "passed") addBlocker(`gates.${gate}`, "Gate has not passed.");
    if (item?.status === "passed") {
      if (!item.evidence) addError(`gates.${gate}.evidence`, "Passed gates require an evidence reference.");
      if (!/^[a-f0-9]{64}$/i.test(item.evidenceSha256 ?? "")) addError(`gates.${gate}.evidenceSha256`, "Passed gates require an evidence SHA-256.");
    }
  }
  for (const approval of requiredApprovals) {
    const item = config.approvals?.[approval];
    if (item?.status !== "approved") addBlocker(`approvals.${approval}`, "Approval is pending.");
    if (item?.status === "approved" && (!item.approvedBy || !Number.isFinite(Date.parse(item.approvedAt)))) {
      addError(`approvals.${approval}`, "Approved entries require approver identity and ISO-8601 time.");
    }
  }

  const expectedSafeguards = {
    productionRolloutBlocked: true,
    forceReadOnlyMode: true,
    enableLiveProviderWrites: false,
    enableCardStateWrites: false,
    enableCardCreation: false,
    enableCardFunding: false,
    enableTelegramSends: false,
    enableOutlookSync: false,
    enableGmailSync: false,
  };
  for (const [key, expected] of Object.entries(expectedSafeguards)) {
    if (config.deploymentSafeguards?.[key] !== expected) addError(`deploymentSafeguards.${key}`, `Must be ${expected} during deployment.`);
  }
  if (config.openingState?.audience !== "all_users") addError("openingState.audience", "Must be all_users.");
  if (config.openingState?.productionRolloutBlocked !== false || config.openingState?.forceReadOnlyMode !== false) addError("openingState", "Opening state must explicitly release the rollout/read-only locks.");
  if (config.openingState?.liveProviderWritesRemainDisabled !== true) addError("openingState.liveProviderWritesRemainDisabled", "Live provider writes must remain disabled at the initial all-user opening.");
  if (config.openingState?.manualReconciliationRequired !== true) addError("openingState.manualReconciliationRequired", "Initial production operations require manual reconciliation.");
  const maximumOperations = config.openingState?.maximumInitialMoneyOperations;
  if (!Number.isInteger(maximumOperations) || maximumOperations < 1 || maximumOperations > 10) addError("openingState.maximumInitialMoneyOperations", "Must be an integer from 1 to 10.");

  if (!config.rollback?.owner) addBlocker("rollback.owner", "A named rollback owner is required.");
  if (config.rollback?.runbook !== "PRODUCTION-ROLLBACK-RUNBOOK.md") addError("rollback.runbook", "Use the bundled production rollback runbook.");
  const thresholds = config.rollback ?? {};
  if (!(thresholds.maximumDecisionMinutes >= 1 && thresholds.maximumDecisionMinutes <= 15)) addError("rollback.maximumDecisionMinutes", "Must be 1-15 minutes.");
  if (!(thresholds.errorRatePercent > 0 && thresholds.errorRatePercent <= 5)) addError("rollback.errorRatePercent", "Must be greater than 0 and at most 5%.");
  if (!(thresholds.p95LatencyMs >= 250 && thresholds.p95LatencyMs <= 5000)) addError("rollback.p95LatencyMs", "Must be 250-5000 ms.");
  if (thresholds.providerMismatchCount !== 1 || thresholds.unexpectedDuplicateCount !== 1) addError("rollback", "A single provider mismatch or unexpected duplicate must trigger rollback.");

  if (options.requireAuthorization && Number.isFinite(start) && Number.isFinite(end)) {
    const now = options.now?.getTime?.() ?? Date.now();
    if (now < start || now > end) addBlocker("maintenanceWindow", "Authorization is valid only inside the approved maintenance window.");
  }
  return { valid: errors.length === 0, authorized: errors.length === 0 && blockers.length === 0, errors, blockers };
}
