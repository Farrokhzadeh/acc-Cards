import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { getCardPolicy, updateCardPolicy } from "@/server/settings/card-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  platformCardLimit: z.number().int().min(1).max(50).optional(),
  minimumCardCreationUsdCents: z.number().int().min(1000).max(10_000_000).optional(),
  bins: z.array(z.object({
    bin: z.string().regex(/^\d{6}$/),
    requiresDob: z.boolean(),
  })).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one card-policy setting is required.");

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "configuration.manage");
    return getCardPolicy();
  });
}

export async function PATCH(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "configuration.manage");
    requireCsrf(request, session);
    const input = patchSchema.parse(await request.json());
    return updateCardPolicy({ ...input, adminId: session.principal.id });
  });
}
