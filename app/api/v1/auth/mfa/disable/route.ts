import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { disableMfa, requireAdmin, requireCsrf } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    const body = schema.parse(await request.json());
    await disableMfa(session, body.code, request, requestId);
    return { ok: true };
  });
}
