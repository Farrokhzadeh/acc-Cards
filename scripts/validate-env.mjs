import { parseServerEnv } from "../config/env-schema.mjs";

try {
  const env = parseServerEnv(process.env);
  console.log(
    `[accabad] environment valid: env=${env.APP_ENV} port=${env.PORT} auth=enabled live_provider_writes=${env.ENABLE_LIVE_PROVIDER_WRITES}`,
  );
} catch (error) {
  console.error("[accabad] invalid environment configuration");
  if (error?.issues) {
    for (const issue of error.issues) {
      console.error(`- ${issue.path.join(".") || "environment"}: ${issue.message}`);
    }
  } else {
    console.error(error);
  }
  process.exit(1);
}
