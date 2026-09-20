import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, reauthenticate } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1).max(500),
  code: z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    const body = schema.parse(await request.json());
    await reauthenticate(session, body.password, body.code, request, requestId);
    return { ok: true, reauthenticatedAt: new Date().toISOString() };
  });
}
