import { z } from "zod";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

const binsSchema = z.array(z.object({
  bin: z.string().regex(/^\d{6}$/),
  requiresDob: z.boolean(),
})).max(50);

async function setting<T>(db: DatabaseQueryable, key: string, fallback: T): Promise<T> {
  const result = await db.query<{ typed_value: T }>("SELECT typed_value FROM settings WHERE key=$1", [key]);
  return result.rows[0]?.typed_value ?? fallback;
}

export async function getCardPolicy(db: DatabaseQueryable = getPool()) {
  const rawBins = await setting<unknown[]>(db, "card_request_bins", []);
  const bins = binsSchema.safeParse(rawBins);
  return {
    minimumCardCreationUsdCents: Math.max(1000, Number(await setting(db, "minimum_card_creation_usd_cents", 2000)) || 2000),
    bins: bins.success ? bins.data : [],
  };
}

export async function updateCardPolicy(input: {
  minimumCardCreationUsdCents?: number;
  bins?: Array<{ bin: string; requiresDob: boolean }>;
  adminId: string;
}) {
  if (input.minimumCardCreationUsdCents !== undefined && (!Number.isInteger(input.minimumCardCreationUsdCents) || input.minimumCardCreationUsdCents < 1000 || input.minimumCardCreationUsdCents > 10_000_000)) {
    throw new ApiError(400, "invalid_card_creation_minimum", "Minimum card creation amount must be between $10 and $100,000.");
  }
  const bins = input.bins === undefined ? undefined : binsSchema.parse(input.bins);
  if (bins && new Set(bins.map((item) => item.bin)).size !== bins.length) {
    throw new ApiError(400, "duplicate_card_bin", "Each card BIN can appear only once.");
  }

  return withTransaction(async (db) => {
    const updates: Array<[string, unknown]> = [];
    if (input.minimumCardCreationUsdCents !== undefined) updates.push(["minimum_card_creation_usd_cents", input.minimumCardCreationUsdCents]);
    if (bins !== undefined) updates.push(["card_request_bins", bins]);

    for (const [key, value] of updates) {
      await db.query(
        `INSERT INTO settings(key,typed_value,updated_by)
         VALUES($1,$2::jsonb,$3::uuid)
         ON CONFLICT(key) DO UPDATE SET
           typed_value=EXCLUDED.typed_value,
           version=settings.version+1,
           updated_by=EXCLUDED.updated_by,
           updated_at=now()`,
        [key, JSON.stringify(value), input.adminId],
      );
    }

    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted)
       VALUES('admin',$1::uuid,'card.policy.updated','configuration','card-policy',$2::jsonb)`,
      [input.adminId, JSON.stringify({
        minimumCardCreationUsdCents: input.minimumCardCreationUsdCents ?? null,
        binCount: bins?.length ?? null,
      })],
    );
    return getCardPolicy(db);
  });
}
