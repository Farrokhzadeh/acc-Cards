import { getPool } from "@/server/database/pool";

const KEY_NUMBER = "payment_card_number";
const KEY_HOLDER = "payment_card_holder";
const KEY_MIN_LOAD = "payment_min_load_usd";
const KEY_ONBOARDING_BIN = "onboarding_card_bin";

export type PaymentCard = { cardNumber: string; cardHolder: string; minLoadUsd: number; onboardingBin: string };

export async function getPaymentCard(): Promise<PaymentCard> {
  const result = await getPool().query<{ key: string; typed_value: unknown }>(
    `SELECT key, typed_value FROM settings WHERE key = ANY($1::text[])`,
    [[KEY_NUMBER, KEY_HOLDER, KEY_MIN_LOAD, KEY_ONBOARDING_BIN]],
  );
  let cardNumber = "";
  let cardHolder = "";
  let minLoadUsd = 25;
  let onboardingBin = "539502";
  for (const row of result.rows) {
    if (row.key === KEY_MIN_LOAD) {
      const n = Number(row.typed_value);
      if (Number.isFinite(n) && n > 0) minLoadUsd = n;
      continue;
    }
    if (row.key === KEY_ONBOARDING_BIN) {
      const value = typeof row.typed_value === "string" ? row.typed_value : String(row.typed_value ?? "");
      if (/^\d{6}$/.test(value)) onboardingBin = value;
      continue;
    }
    const value = typeof row.typed_value === "string" ? row.typed_value : String(row.typed_value ?? "");
    if (row.key === KEY_NUMBER) cardNumber = value;
    else cardHolder = value;
  }
  return { cardNumber, cardHolder, minLoadUsd, onboardingBin };
}

export async function setPaymentCard(input: PaymentCard): Promise<PaymentCard> {
  await getPool().query(
    `INSERT INTO settings(key, typed_value) VALUES ($1, to_json($2::text))
     ON CONFLICT (key) DO UPDATE SET typed_value = to_json($2::text), version = settings.version + 1, updated_at = now()`,
    [KEY_NUMBER, input.cardNumber],
  );
  await getPool().query(
    `INSERT INTO settings(key, typed_value) VALUES ($1, to_json($2::text))
     ON CONFLICT (key) DO UPDATE SET typed_value = to_json($2::text), version = settings.version + 1, updated_at = now()`,
    [KEY_HOLDER, input.cardHolder],
  );
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
