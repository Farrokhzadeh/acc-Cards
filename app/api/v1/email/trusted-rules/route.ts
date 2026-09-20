import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { auditAdminEvent, requireAdmin, requireCsrf } from "@/server/auth/service";
import { createTrustedRule, listTrustedRules } from "@/server/email/classifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  label: z.string().trim().min(2).max(120),
  senderMatch: z.string().trim().min(3).max(320),
  subjectContains: z.string().trim().max(200).nullable().optional(),
  category: z.enum(["verification", "security", "otp_3ds"]),
  otpExpiryMinutes: z.number().int().min(1).max(60).optional(),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "inbox.read");
    return { items: await listTrustedRules() };
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.rules.manage");
    requireCsrf(request, session);
    const input = createSchema.parse(await request.json());
    const created = await createTrustedRule(input, session.principal.id);
    await auditAdminEvent({ adminId: session.principal.id, action: "email.trusted_rule.created", entityType: "email_trusted_rule", entityId: created.id, request, requestId,
      metadata: { label: input.label, senderMatch: input.senderMatch, category: input.category } });
    return created;
  });
}
