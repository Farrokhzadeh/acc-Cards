import { getPool } from "@/server/database/pool";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { decryptSecret, encryptSecret, randomToken } from "@/server/security/crypto";
import { TelegramClient } from "@/server/providers/telegram/client";

const SETTING_KEY = "telegram_bot_credentials";
const TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;

export type TelegramTokenSource = "database" | "environment" | "none";

export type TelegramCredentials = {
  token: string | null;
  webhookSecret: string | null;
  source: TelegramTokenSource;
  tokenHint: string | null;
};

type StoredCreds = { tokenEnc?: string; secretEnc?: string; tokenHint?: string; updatedAt?: string };

function hintOf(token: string): string {
  return token.slice(-4);
}

async function readStored(): Promise<StoredCreds | null> {
  const result = await getPool().query<{ typed_value: StoredCreds }>(
    `SELECT typed_value FROM settings WHERE key = $1`,
    [SETTING_KEY],
  );
  return result.rows[0]?.typed_value ?? null;
}

export async function getTelegramCredentials(): Promise<TelegramCredentials> {
  const env = parseServerEnv(process.env);
  const stored = await readStored().catch(() => null);
  if (stored?.tokenEnc) {
    try {
      const token = decryptSecret(stored.tokenEnc);
      if (token) {
        const webhookSecret = stored.secretEnc ? decryptSecret(stored.secretEnc) : env.TELEGRAM_WEBHOOK_SECRET || null;
        return { token, webhookSecret, source: "database", tokenHint: hintOf(token) };
      }
    } catch {
    }
  }
  const token = env.TELEGRAM_BOT_TOKEN || null;
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || null;
  return { token, webhookSecret, source: token ? "environment" : "none", tokenHint: token ? hintOf(token) : null };
}

export async function getTelegramClient(): Promise<TelegramClient> {
  const creds = await getTelegramCredentials();
  return new TelegramClient(creds.token ?? undefined);
}

export async function setTelegramBotToken(rawToken: string): Promise<{ tokenHint: string }> {
  const token = rawToken.trim();
  if (!TOKEN_PATTERN.test(token)) throw new Error("invalid_telegram_token");
  const existing = await readStored().catch(() => null);
  const secretEnc = existing?.secretEnc ?? encryptSecret(randomToken(32));
  const tokenHint = hintOf(token);
  const value: StoredCreds = {
    tokenEnc: encryptSecret(token),
    secretEnc,
    tokenHint,
    updatedAt: new Date().toISOString(),
  };
  await getPool().query(
    `INSERT INTO settings(key, typed_value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET typed_value = EXCLUDED.typed_value, version = settings.version + 1, updated_at = now()`,
    [SETTING_KEY, JSON.stringify(value)],
  );
  return { tokenHint };
}

export async function clearTelegramBotToken(): Promise<{ cleared: true }> {
  await getPool().query(`DELETE FROM settings WHERE key = $1`, [SETTING_KEY]);
  return { cleared: true };
}
