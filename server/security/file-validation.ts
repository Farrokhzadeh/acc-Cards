import { ApiError } from "@/server/http/api";

export type PrivateUploadMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const ACTIVE_PDF_TOKENS = /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia)\b/i;

function detect(bytes: Buffer): PrivateUploadMime | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 20 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.length >= 16 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function validatePrivateUpload(bytes: Buffer, declaredMimeType?: string | null) {
  const mime = detect(bytes);
  if (!mime) throw new ApiError(415, "upload_type_not_allowed", "Upload a PDF, JPEG, PNG, or WebP file.");
  const declared = declaredMimeType?.split(";", 1)[0]?.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== mime) {
    throw new ApiError(415, "upload_type_mismatch", "The declared file type does not match the file contents.");
  }

  if (mime === "application/pdf") {
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
    if (!tail.includes("%%EOF")) throw new ApiError(422, "invalid_pdf", "The PDF is incomplete or malformed.");
    if (ACTIVE_PDF_TOKENS.test(bytes.toString("latin1"))) {
      throw new ApiError(422, "active_pdf_rejected", "PDFs containing active or embedded content are not accepted.");
    }
  } else if (mime === "image/jpeg") {
    if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new ApiError(422, "invalid_image", "The JPEG is incomplete or malformed.");
  } else if (mime === "image/png") {
    if (!bytes.subarray(-PNG_IEND.length).equals(PNG_IEND)) throw new ApiError(422, "invalid_image", "The PNG is incomplete or malformed.");
  } else {
    const declaredSize = bytes.readUInt32LE(4) + 8;
    const subtype = bytes.subarray(12, 16).toString("ascii");
    if (declaredSize !== bytes.length || !["VP8 ", "VP8L", "VP8X"].includes(subtype)) {
      throw new ApiError(422, "invalid_image", "The WebP image is incomplete or malformed.");
    }
  }
  return mime;
}
