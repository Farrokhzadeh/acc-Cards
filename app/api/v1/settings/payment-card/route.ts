import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getPaymentCard, setPaymentCard } from "@/server/settings/payment-card";
import { getCardRequestBins } from "@/server/card-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  cardNumber: z.string().trim().max(40),
  cardHolder: z.string().trim().max(80),
  minLoadUsd: z.number().min(1).max(100000).optional(),
  onboardingBin: z.string().regex(/^\d{6}$/).optional(),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request);
    const [paymentCard, allowedBins] = await Promise.all([getPaymentCard(), getCardRequestBins()]);
    return { ...paymentCard, allowedBins };
  });
}

export async function PUT(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    const input = bodySchema.parse(await request.json());
    const [current, allowedBins] = await Promise.all([getPaymentCard(), getCardRequestBins()]);
    const onboardingBin = input.onboardingBin ?? current.onboardingBin;
    if (!allowedBins.some((item) => item.bin === onboardingBin)) {
      throw new ApiError(400, "unsupported_onboarding_bin", "Choose a first-card BIN from the provider-supported list.");
    }
    await setPaymentCard({
      cardNumber: input.cardNumber,
      cardHolder: input.cardHolder,
      minLoadUsd: input.minLoadUsd ?? current.minLoadUsd,
      onboardingBin,
    });
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "settings.payment_card.update",
      entityType: "settings",
      entityId: "payment_card",
      request,
      requestId,
    });
    return { ok: true as const };
  });
}
