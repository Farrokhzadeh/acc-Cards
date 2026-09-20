import { readRolloutConfig, validateRolloutConfig } from "./config.mjs";

const requireAuthorization = process.argv.includes("--authorize");
try {
  const { filename, config } = await readRolloutConfig();
  const result = validateRolloutConfig(config, { requireAuthorization });
  console.log(JSON.stringify({ configuration: filename, mode: requireAuthorization ? "authorize" : "validate", ...result }, null, 2));
  if (!result.valid || (requireAuthorization && !result.authorized)) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ valid: false, authorized: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 2;
}
