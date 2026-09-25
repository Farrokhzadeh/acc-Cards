import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { getBotTextImage, removeBotTextImage, setBotTextImage } from "@/server/telegram/text-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "bot_texts.read");
    const { key } = await context.params;
    const image = await getBotTextImage(decodeURIComponent(key));
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(image.filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "bot_texts.manage");
    requireCsrf(request, session);
    const { key } = await context.params;
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new ApiError(400, "bot_text_image_required", "Choose an image to upload.");
    return setBotTextImage(decodeURIComponent(key), file, session, request, requestId);
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "bot_texts.manage");
    requireCsrf(request, session);
    const { key } = await context.params;
    return removeBotTextImage(decodeURIComponent(key), session, request, requestId);
  });
}
