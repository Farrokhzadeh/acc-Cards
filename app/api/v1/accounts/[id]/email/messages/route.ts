import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { listStoredEmailMessages } from "@/server/email/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "inbox.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    const url = new URL(request.url);
    const query = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
    return { items: await listStoredEmailMessages(id, query.limit) };
  });
}
