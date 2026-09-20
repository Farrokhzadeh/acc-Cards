import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool } from "@/server/database/pool";

export const runtimeControlKeys = [
  "provider_writes",
  "card_creation",
  "card_funding",
  "telegram_sends",
  "outlook_sync",
  "gmail_sync",
  "read_only_mode",
] as const;

export type RuntimeControlKey = (typeof runtimeControlKeys)[number];

const descriptions: Record<RuntimeControlKey, { label: string; description: string }> = {
  provider_writes: { label: "Kripicard writes", description: "Master runtime gate for every Kripicard provider write." },
  card_creation: { label: "Card creation", description: "Allow guarded createcard execution when the deployment gate is also enabled." },
  card_funding: { label: "Card funding", description: "Allow guarded fundcard execution when the deployment gate is also enabled." },
  telegram_sends: { label: "Telegram sends", description: "Allow outbound Telegram messages, documents, and callback answers." },
  outlook_sync: { label: "Outlook sync", description: "Allow manual and scheduled Microsoft Graph mailbox synchronization." },
  gmail_sync: { label: "Gmail sync", description: "Allow manual and scheduled Gmail mailbox synchronization." },
  read_only_mode: { label: "Read-only mode", description: "Block application mutations while keeping login, diagnostics, and emergency controls available." },
};

type ControlRow = {
  control_key: RuntimeControlKey;
  enabled: boolean;
  reason: string;
  updated_by: string | null;
  updated_at: Date;
};

function deploymentState(key: RuntimeControlKey) {
  const env = parseServerEnv(process.env);
  const rolloutBlocked = env.APP_ENV === "production" && env.PRODUCTION_ROLLOUT_BLOCKED;
  switch (key) {
    case "provider_writes": return { allowed: !rolloutBlocked && env.ENABLE_LIVE_PROVIDER_WRITES, forced: false };
    case "card_creation": return { allowed: !rolloutBlocked && env.ENABLE_LIVE_PROVIDER_WRITES && env.ENABLE_KRIPICARD_CARD_CREATION, forced: false };
    case "card_funding": return { allowed: !rolloutBlocked && env.ENABLE_LIVE_PROVIDER_WRITES && env.ENABLE_KRIPICARD_CARD_FUNDING, forced: false };
    case "telegram_sends": return { allowed: !rolloutBlocked && env.ENABLE_TELEGRAM_SENDS, forced: false };
    case "outlook_sync": return { allowed: !rolloutBlocked && env.ENABLE_OUTLOOK_SYNC, forced: false };
    case "gmail_sync": return { allowed: !rolloutBlocked && env.ENABLE_GMAIL_SYNC, forced: false };
    case "read_only_mode": return { allowed: true, forced: env.FORCE_READ_ONLY_MODE || rolloutBlocked };
  }
}

function present(row: ControlRow) {
  const deployment = deploymentState(row.control_key);
  const effectiveEnabled = row.control_key === "read_only_mode"
    ? row.enabled || deployment.forced
    : row.enabled && deployment.allowed;
  return {
    key: row.control_key,
    ...descriptions[row.control_key],
    runtimeEnabled: row.enabled,
    deploymentAllowed: deployment.allowed,
    deploymentForced: deployment.forced,
    effectiveEnabled,
    reason: row.reason,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listRuntimeControls() {
  const result = await getPool().query<ControlRow>(
    `SELECT control_key,enabled,reason,updated_by,updated_at
       FROM runtime_controls
      ORDER BY array_position($1::text[], control_key)`,
    [runtimeControlKeys],
  );
  return result.rows.map(present);
}

export async function runtimeControlEnabled(key: RuntimeControlKey) {
  const result = await getPool().query<ControlRow>(
    `SELECT control_key,enabled,reason,updated_by,updated_at FROM runtime_controls WHERE control_key=$1`,
    [key],
  );
  const row = result.rows[0];
  if (!row) return false;
  return present(row).effectiveEnabled;
}

export async function readOnlyModeEnabled() {
  return runtimeControlEnabled("read_only_mode");
}

export async function updateRuntimeControl(key: RuntimeControlKey, enabled: boolean, reason: string, adminId: string) {
  const result = await getPool().query<ControlRow>(
    `UPDATE runtime_controls
        SET enabled=$2,reason=$3,updated_by=$4::uuid,updated_at=now()
      WHERE control_key=$1
      RETURNING control_key,enabled,reason,updated_by,updated_at`,
    [key, enabled, reason.trim(), adminId],
  );
  return result.rows[0] ? present(result.rows[0]) : null;
}
