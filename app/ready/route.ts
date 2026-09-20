import { safeParseServerEnv } from "@/config/env-schema.mjs";
import { pingDatabase } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const parsed = safeParseServerEnv(process.env);

  if (!parsed.success) {
    return Response.json(
      {
        status: "not_ready",
        service: "accabad-admin",
        reason: "invalid_environment",
      },
      { status: 503 },
    );
  }

  try {
    const databaseReady = await pingDatabase();
    if (!databaseReady) throw new Error("unexpected database ping result");
  } catch {
    return Response.json(
      {
        status: "not_ready",
        service: "accabad-admin",
        reason: "database_unreachable",
      },
      { status: 503 },
    );
  }

  return Response.json({
    status: "ready",
    service: "accabad-admin",
    environment: parsed.data.APP_ENV,
    database: "queryable",
    liveProviderWrites: parsed.data.ENABLE_LIVE_PROVIDER_WRITES,
    kripicardCardStateWrites: parsed.data.ENABLE_KRIPICARD_CARD_STATE_WRITES,
    kripicardCardCreation: parsed.data.ENABLE_KRIPICARD_CARD_CREATION,
  });
}
