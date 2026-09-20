import { assertSafeStagingTarget, loadAcceptanceConfig, requiredStagingSecrets } from "./safety.mjs";

try {
  const { filename, config } = await loadAcceptanceConfig();
  const target = assertSafeStagingTarget(config);
  const missing = requiredStagingSecrets();
  const liveIds = Object.entries(config.workflow ?? {}).filter(([, value]) => typeof value === "string" && value.length > 0).length;
  const result = {
    ok: missing.length === 0,
    configurationFile: filename,
    targetOrigin: target.origin,
    expectedEnvironment: config.expectedAppEnvironment,
    configuredWorkflowIdentifiers: liveIds,
    missingEnvironmentVariables: missing,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 2;
}
