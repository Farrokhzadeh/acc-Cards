import { getPool } from "@/server/database/pool";

const KEY_MIN_LOAD = "payment_min_load_usd";
const KEY_ONBOARDING_BIN = "onboarding_card_bin";

export type FirstCardSettings = { minLoadUsd: number; onboardingBin: string };

export async function getFirstCardSettings(): Promise<FirstCardSettings> {
  const result = await getPool().query<{ key: string; typed_value: unknown }>(
    `SELECT key, typed_value FROM settings WHERE key = ANY($1::text[])`,
    [[KEY_MIN_LOAD, KEY_ONBOARDING_BIN]],
  );
  let minLoadUsd = 25;
  let onboardingBin = "539502";
  for (const row of result.rows) {
    if (row.key === KEY_MIN_LOAD) {
      const value = Number(row.typed_value);
      if (Number.isFinite(value) && value > 0) minLoadUsd = value;
    } else {
      const value = typeof row.typed_value === "string" ? row.typed_value : String(row.typed_value ?? "");
      if (/^\d{6}$/.test(value)) onboardingBin = value;
    }
  }
  return { minLoadUsd, onboardingBin };
}

export async function setFirstCardSettings(input: FirstCardSettings): Promise<FirstCardSettings> {
  await getPool().query(
    `INSERT INTO settings(key, typed_value) VALUES ($1, to_json($2::int))
     ON CONFLICT (key) DO UPDATE SET typed_value = to_json($2::int), version = settings.version + 1, updated_at = now()`,
    [KEY_MIN_LOAD, Math.round(input.minLoadUsd)],
  );
  await getPool().query(
    `INSERT INTO settings(key, typed_value) VALUES ($1, to_json($2::text))
     ON CONFLICT (key) DO UPDATE SET typed_value = to_json($2::text), version = settings.version + 1, updated_at = now()`,
    [KEY_ONBOARDING_BIN, input.onboardingBin],
  );
  return input;
}
