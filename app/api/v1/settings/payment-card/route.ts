import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getPaymentCard, setPaymentCard } from "@/server/settings/payment-card";

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
    return getPaymentCard();
  });
}

export async function PUT(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    const input = bodySchema.parse(await request.json());
    const current = await getPaymentCard();
    await setPaymentCard({
      cardNumber: input.cardNumber,
      cardHolder: input.cardHolder,
      minLoadUsd: input.minLoadUsd ?? current.minLoadUsd,
      onboardingBin: input.onboardingBin ?? current.onboardingBin,
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
