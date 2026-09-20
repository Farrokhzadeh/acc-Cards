import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { randomToken } from "@/server/security/crypto";
import { scanReceiptForMalware } from "@/server/receipts/antivirus";
import { validatePrivateUpload, type PrivateUploadMime } from "@/server/security/file-validation";

function extensionFor(mime: PrivateUploadMime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function safeFilename(value?: string | null) {
  if (!value) return null;
  const base = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  return base || null;
}

export async function storePrivateReceipt(input: {
  requestId: string;
  bytes: Buffer;
  originalFilename?: string | null;
  declaredMimeType?: string | null;
}) {
  const env = parseServerEnv(process.env);
  if (input.bytes.length < 1) throw new ApiError(400, "receipt_empty", "The receipt file is empty.");
  if (input.bytes.length > env.RECEIPT_MAX_BYTES) throw new ApiError(413, "receipt_too_large", `Receipt files may be at most ${Math.floor(env.RECEIPT_MAX_BYTES / 1024 / 1024)} MB.`);
  const mime = validatePrivateUpload(input.bytes, input.declaredMimeType);
  const antivirus = await scanReceiptForMalware(input.bytes);
  const day = new Date().toISOString().slice(0, 10);
  const objectKey = `${day}/${input.requestId}/${randomToken(24)}.${extensionFor(mime)}`;
  const root = path.resolve(env.RECEIPTS_STORAGE_DIR);
  const destination = path.resolve(root, objectKey);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Invalid receipt object path.");
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const handle = await open(destination, "wx", 0o600);
  try { await handle.writeFile(input.bytes); } finally { await handle.close(); }
  return {
    objectKey,
    originalFilename: safeFilename(input.originalFilename),
    declaredMimeType: input.declaredMimeType?.slice(0, 100) || null,
    detectedMimeType: mime,
    sizeBytes: input.bytes.length,
    sha256Hex: createHash("sha256").update(input.bytes).digest("hex"),
    scanEngine: `strict_structure_v2+${antivirus.engine}`,
    scanStatus: "clean" as const,
    scanNote: `File signature, structure, and active-content validation passed. ${antivirus.note}`,
  };
}

export async function readPrivateReceipt(objectKey: string) {
  const env = parseServerEnv(process.env);
  const root = path.resolve(env.RECEIPTS_STORAGE_DIR);
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new ApiError(400, "invalid_receipt_key", "Invalid receipt object key.");
  return readFile(target);
}

export async function deletePrivateReceipt(objectKey: string) {
  const env = parseServerEnv(process.env);
  const root = path.resolve(env.RECEIPTS_STORAGE_DIR);
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new ApiError(400, "invalid_receipt_key", "Invalid receipt object key.");
  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
