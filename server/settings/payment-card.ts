import { getPool } from "@/server/database/pool";

// Destination payment card shown to customers in the Telegram bot when they need
// to make a payment. Configured (and changeable) by admins in Settings.

const KEY_NUMBER = "payment_card_number";
const KEY_HOLDER = "payment_card_holder";

export type PaymentCard = { cardNumber: string; cardHolder: string };

export async function getPaymentCard(): Promise<PaymentCard> {
  const result = await getPool().query<{ key: string; typed_value: unknown }>(
    `SELECT key, typed_value FROM settings WHERE key = ANY($1::text[])`,
    [[KEY_NUMBER, KEY_HOLDER]],
  );
  let cardNumber = "";
  let cardHolder = "";
  for (const row of result.rows) {
    const value = typeof row.typed_value === "string" ? row.typed_value : String(row.typed_value ?? "");
    if (row.key === KEY_NUMBER) cardNumber = value;
    else cardHolder = value;
  }
  return { cardNumber, cardHolder };
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
  return input;
}
