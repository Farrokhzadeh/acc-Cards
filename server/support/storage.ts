import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { randomToken } from "@/server/security/crypto";
import { scanFileForMalware } from "@/server/receipts/antivirus";
import { validatePrivateUpload, type PrivateUploadMime } from "@/server/security/file-validation";

function extensionFor(mime: PrivateUploadMime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function sanitizeSupportFilename(value?: string | null) {
  if (!value) return null;
  const base = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  return base || null;
}

function resolveObject(objectKey: string) {
  const env = parseServerEnv(process.env);
  const root = path.resolve(env.SUPPORT_ATTACHMENTS_STORAGE_DIR);
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new ApiError(400, "invalid_support_attachment_key", "Invalid support attachment key.");
  return { root, target };
}

export async function storePrivateSupportAttachment(input: {
  conversationId: string;
  bytes: Buffer;
  originalFilename?: string | null;
  declaredMimeType?: string | null;
}) {
  const env = parseServerEnv(process.env);
  if (input.bytes.length < 1) throw new ApiError(400, "support_attachment_empty", "The attachment is empty.");
  if (input.bytes.length > env.SUPPORT_ATTACHMENT_MAX_BYTES) {
    throw new ApiError(413, "support_attachment_too_large", `Support attachments may be at most ${Math.floor(env.SUPPORT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB.`);
  }
  const mime = validatePrivateUpload(input.bytes, input.declaredMimeType);
  const antivirus = await scanFileForMalware(input.bytes);
  const day = new Date().toISOString().slice(0, 10);
  const objectKey = `${day}/${input.conversationId}/${randomToken(24)}.${extensionFor(mime)}`;
  const { target } = resolveObject(objectKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, "wx", 0o600);
  try { await handle.writeFile(input.bytes); } finally { await handle.close(); }
  return {
    objectKey,
    originalFilename: sanitizeSupportFilename(input.originalFilename),
    declaredMimeType: input.declaredMimeType?.slice(0, 100) || null,
    detectedMimeType: mime,
    sizeBytes: input.bytes.length,
    sha256Hex: createHash("sha256").update(input.bytes).digest("hex"),
    scanEngine: `strict_structure_v2+${antivirus.engine}`,
    scanStatus: "clean" as const,
    scanNote: `File signature, structure, and active-content validation passed. ${antivirus.note}`,
  };
}

export async function readPrivateSupportAttachment(objectKey: string) {
  const { target } = resolveObject(objectKey);
  return readFile(target);
}

export async function deletePrivateSupportAttachment(objectKey: string) {
  const { target } = resolveObject(objectKey);
  try { await unlink(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
