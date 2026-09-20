import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { getFundingSettings, updateFundingSettings } from "@/server/funding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  serviceFeeBasisPoints: z.number().int().min(0).max(5000).optional(),
  minimumUsdCents: z.number().int().min(1000).max(10_000_000).optional(),
  rialPerUsd: z.number().int().positive().safe().optional(),
  rateValidMinutes: z.number().int().min(5).max(1440).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "funding.read");
    return getFundingSettings();
  });
}

export async function PATCH(request: Request) {
  return apiRoute(request, async () => {
    const session = await requireAdmin(request, "funding.pricing.manage");
    requireCsrf(request, session);
    const input = patchSchema.parse(await request.json());
    return updateFundingSettings({ ...input, adminId: session.principal.id });
  });
}
