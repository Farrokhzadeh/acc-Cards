import { z } from "zod";
import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { applyBotTextOverrides, getBotTextByKey, getBotTextCatalog } from "@/server/kyc/messages";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const RUNTIME_TTL_MS = 5_000;

type OverrideRow = {
  key: string;
  en_text: string;
  fa_text: string;
  image_bytes: Buffer | null;
  image_mime_type: string | null;
  image_filename: string | null;
  updated_at: Date;
};

type RuntimeEntry = { key: string; enText: string; faText: string; hasImage: boolean };

let runtimeLoadedAt = 0;
let runtimeEntries: RuntimeEntry[] = [];

function placeholders(text: string) {
  return [...new Set(Array.from(text.matchAll(/\{([A-Za-z0-9_]+)\}/g), (match) => match[1]))].sort();
}

function assertPlaceholders(defaultText: string, editedText: string, field: "enText" | "faText") {
  const expected = placeholders(defaultText);
  const actual = placeholders(editedText);
  if (expected.join("|") !== actual.join("|")) {
    const required = expected.length ? expected.map((value) => "{" + value + "}").join(", ") : "none";
    throw new ApiError(400, "bot_text_placeholders_invalid", field + " must preserve placeholders: " + required + ".");
  }
}

export const updateBotTextInput = z.object({
  enText: z.string().min(1).max(4096),
  faText: z.string().min(1).max(4096),
});

async function rows(includeBytes = false) {
  const imageColumn = includeBytes ? "image_bytes" : "NULL::bytea AS image_bytes";
  const result = await getPool().query<OverrideRow>(
    "SELECT key,en_text,fa_text," + imageColumn + ",image_mime_type,image_filename,updated_at FROM bot_text_overrides ORDER BY key ASC",
  );
  return result.rows;
}

export async function refreshBotTextRuntime(force = false) {
  if (!force && Date.now() - runtimeLoadedAt < RUNTIME_TTL_MS) return;
  const stored = await rows(false);
  applyBotTextOverrides(stored.map((row) => ({ key: row.key, enText: row.en_text, faText: row.fa_text })));
  const byKey = new Map(stored.map((row) => [row.key, row]));
  runtimeEntries = getBotTextCatalog().map((entry) => {
    const override = byKey.get(entry.key);
    return {
      key: entry.key,
      enText: override?.en_text ?? entry.defaultEn,
      faText: override?.fa_text ?? entry.defaultFa,
      hasImage: Boolean(override?.image_mime_type),
    };
  });
  runtimeLoadedAt = Date.now();
}

export async function listBotTexts() {
  const stored = await rows(false);
  const byKey = new Map(stored.map((row) => [row.key, row]));
  return getBotTextCatalog().map((entry) => {
    const override = byKey.get(entry.key);
    return {
      ...entry,
      enText: override?.en_text ?? entry.defaultEn,
      faText: override?.fa_text ?? entry.defaultFa,
      overridden: Boolean(override),
      hasImage: Boolean(override?.image_mime_type),
      imageMimeType: override?.image_mime_type ?? null,
      imageFilename: override?.image_filename ?? null,
      updatedAt: override?.updated_at?.toISOString() ?? null,
    };
  });
}

export async function updateBotText(key: string, input: z.infer<typeof updateBotTextInput>, session: AuthSession, request: Request, requestId: string) {
  const defaults = getBotTextByKey(key);
  if (!defaults) throw new ApiError(404, "bot_text_not_found", "Bot text key not found.");
  assertPlaceholders(defaults.en, input.enText, "enText");
  assertPlaceholders(defaults.fa, input.faText, "faText");
  await getPool().query(
    "INSERT INTO bot_text_overrides(key,en_text,fa_text,updated_by,updated_at) VALUES($1,$2,$3,$4::uuid,now()) ON CONFLICT(key) DO UPDATE SET en_text=EXCLUDED.en_text,fa_text=EXCLUDED.fa_text,updated_by=EXCLUDED.updated_by,updated_at=now()",
    [key, input.enText, input.faText, session.principal.id],
  );
  runtimeLoadedAt = 0;
  await auditAdminEvent({ adminId: session.principal.id, action: "bot_text.update", entityType: "bot_text", entityId: key, request, requestId });
  return { key };
}

export async function resetBotText(key: string, session: AuthSession, request: Request, requestId: string) {
  const defaults = getBotTextByKey(key);
  if (!defaults) throw new ApiError(404, "bot_text_not_found", "Bot text key not found.");
  await getPool().query(
    "INSERT INTO bot_text_overrides(key,en_text,fa_text,updated_by,updated_at) VALUES($1,$2,$3,$4::uuid,now()) ON CONFLICT(key) DO UPDATE SET en_text=EXCLUDED.en_text,fa_text=EXCLUDED.fa_text,updated_by=EXCLUDED.updated_by,updated_at=now()",
    [key, defaults.en, defaults.fa, session.principal.id],
  );
  runtimeLoadedAt = 0;
  await auditAdminEvent({ adminId: session.principal.id, action: "bot_text.reset", entityType: "bot_text", entityId: key, request, requestId });
  return { key };
}

export async function setBotTextImage(key: string, file: File, session: AuthSession, request: Request, requestId: string) {
  const defaults = getBotTextByKey(key);
  if (!defaults) throw new ApiError(404, "bot_text_not_found", "Bot text key not found.");
  if (!ALLOWED_IMAGE_MIME.has(file.type)) throw new ApiError(415, "bot_text_image_type_invalid", "Use a JPEG, PNG, or WebP image.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, "bot_text_image_too_large", "Bot text images must be 5 MB or smaller.");
  await getPool().query(
    "INSERT INTO bot_text_overrides(key,en_text,fa_text,image_bytes,image_mime_type,image_filename,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::uuid,now()) ON CONFLICT(key) DO UPDATE SET image_bytes=EXCLUDED.image_bytes,image_mime_type=EXCLUDED.image_mime_type,image_filename=EXCLUDED.image_filename,updated_by=EXCLUDED.updated_by,updated_at=now()",
    [key, defaults.en, defaults.fa, bytes, file.type, file.name.slice(0, 180) || "bot-image", session.principal.id],
  );
  runtimeLoadedAt = 0;
  await auditAdminEvent({ adminId: session.principal.id, action: "bot_text.image_set", entityType: "bot_text", entityId: key, request, requestId, metadata: { mimeType: file.type, sizeBytes: bytes.length } });
  return { key };
}

export async function removeBotTextImage(key: string, session: AuthSession, request: Request, requestId: string) {
  if (!getBotTextByKey(key)) throw new ApiError(404, "bot_text_not_found", "Bot text key not found.");
  await getPool().query(
    "UPDATE bot_text_overrides SET image_bytes=NULL,image_mime_type=NULL,image_filename=NULL,updated_by=$2::uuid,updated_at=now() WHERE key=$1",
    [key, session.principal.id],
  );
  runtimeLoadedAt = 0;
  await auditAdminEvent({ adminId: session.principal.id, action: "bot_text.image_removed", entityType: "bot_text", entityId: key, request, requestId });
  return { key };
}

export async function getBotTextImage(key: string) {
  const result = await getPool().query<{ image_bytes: Buffer; image_mime_type: string; image_filename: string | null }>(
    "SELECT image_bytes,image_mime_type,image_filename FROM bot_text_overrides WHERE key=$1 AND image_bytes IS NOT NULL",
    [key],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "bot_text_image_not_found", "No image is configured for this bot text.");
  return { bytes: row.image_bytes, mimeType: row.image_mime_type, filename: row.image_filename ?? "bot-image" };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function templatePattern(template: string) {
  let source = "";
  let index = 0;
  for (const match of template.matchAll(/\{[A-Za-z0-9_]+\}/g)) {
    const start = match.index ?? 0;
    source += escapeRegex(template.slice(index, start));
    source += "[\\s\\S]+?";
    index = start + match[0].length;
  }
  source += escapeRegex(template.slice(index));
  return new RegExp(source);
}

export async function imageForRenderedBotText(text: string, lang: string | null | undefined) {
  await refreshBotTextRuntime();
  const candidates = runtimeEntries
    .filter((entry) => entry.hasImage)
    .map((entry) => ({ key: entry.key, template: lang === "fa" ? entry.faText : entry.enText }))
    .filter((entry) => entry.template && templatePattern(entry.template).test(text))
    .sort((a, b) => b.template.length - a.template.length);
  if (!candidates[0]) return null;
  return getBotTextImage(candidates[0].key);
}
