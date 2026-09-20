import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadAcceptanceConfig() {
  const configured = process.env.ACCEPTANCE_CONFIG_FILE?.trim();
  if (!configured) throw new Error("Set ACCEPTANCE_CONFIG_FILE to a Phase 23 staging JSON file.");
  const filename = path.resolve(configured);
  const config = JSON.parse(await readFile(filename, "utf8"));
  if (!config || typeof config !== "object" || typeof config.baseUrl !== "string") {
    throw new Error("Acceptance configuration requires baseUrl.");
  }
  return { filename, config };
}

export function assertSafeStagingTarget(config) {
  const target = new URL(config.baseUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  const stagingName = /(^|[.-])(stage|staging|test|sandbox)([.-]|$)/i.test(target.hostname);
  if ((!local && target.protocol !== "https:") || (!local && !stagingName)) {
    throw new Error("Refusing acceptance target: use HTTPS and a hostname explicitly identifying staging/test/sandbox.");
  }
  if (/prod(uction)?/i.test(target.hostname)) throw new Error("Refusing a production-named acceptance target.");
  if (config.expectedAppEnvironment !== "staging") throw new Error("expectedAppEnvironment must be exactly 'staging'.");
  if (process.env.ACCEPTANCE_TARGET_CONFIRM !== target.origin) {
    throw new Error(`Set ACCEPTANCE_TARGET_CONFIRM exactly to ${target.origin}.`);
  }
  return target;
}

export function requiredStagingSecrets() {
  const missing = [];
  for (const key of ["ACCEPTANCE_ADMIN_EMAIL", "ACCEPTANCE_ADMIN_PASSWORD"]) {
    if (!process.env[key]?.trim()) missing.push(key);
  }
  return missing;
}

export function redactEvidence(value) {
  const sensitive = /(password|secret|token|authorization|cookie|cvv|cvc|pan|otp)/i;
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[redacted]" : redactEvidence(item)]));
  }
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card-data-redacted]")
      .slice(0, 4000);
  }
  return value;
}
