import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getCardRequestBins } from "@/server/card-requests/service";
import { getFirstCardSettings, setFirstCardSettings } from "@/server/settings/first-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  minLoadUsd: z.number().min(1).max(100000),
  onboardingBin: z.string().regex(/^\d{6}$/),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "configuration.manage");
    const [settings, allowedBins] = await Promise.all([getFirstCardSettings(), getCardRequestBins()]);
    return { ...settings, allowedBins };
  });
}

export async function PUT(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "configuration.manage");
    requireCsrf(request, session);
    const input = bodySchema.parse(await request.json());
    const allowedBins = await getCardRequestBins();
    if (!allowedBins.some((item) => item.bin === input.onboardingBin)) {
      throw new ApiError(400, "unsupported_onboarding_bin", "Choose a first-card BIN from the provider-supported list.");
    }
    await setFirstCardSettings(input);
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "settings.first_card.update",
      entityType: "settings",
      entityId: "first_card",
      request,
      requestId,
    });
    return { ok: true as const };
  });
}
