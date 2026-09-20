import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getKycDocument } from "@/server/kyc/service";
import { readPrivateSupportAttachment, sanitizeSupportFilename } from "@/server/support/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "kyc.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "kyc id");
    const doc = await getKycDocument(id);
    if (!doc) throw new ApiError(404, "not_found", "No document is attached to this submission.");
    const bytes = await readPrivateSupportAttachment(doc.objectKey);
    const filename = sanitizeSupportFilename(doc.filename) ?? "kyc-document";
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "kyc.document.viewed",
      entityType: "kyc_submission",
      entityId: id,
      request,
      requestId,
      metadata: { mimeType: doc.mimeType, sizeBytes: bytes.length },
    });
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": doc.mimeType || "application/octet-stream",
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
