import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { getReceiptForAdmin } from "@/server/funding/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDownloadName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || "receipt";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "funding.read");
    const { id } = await context.params;
    const receipt = await getReceiptForAdmin(requireUuid(id, "funding request id"));
    return new Response(receipt.bytes, {
      headers: {
        "content-type": receipt.mimeType,
        "content-disposition": `attachment; filename="${safeDownloadName(receipt.filename)}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  });
}
