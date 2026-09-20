import { apiRoute } from "@/server/http/api";
import { auditAdminEvent, requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { revealOtpForMessage } from "@/server/email/classifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ messageId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.otp.reveal");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { messageId: rawId } = await context.params;
    const messageId = requireUuid(rawId, "message id");
    const otp = await revealOtpForMessage(messageId);
    await auditAdminEvent({ adminId: session.principal.id, action: "email.otp.revealed", entityType: "email_message", entityId: messageId, request, requestId,
      metadata: { expiresAt: otp.expiresAt, deliveryStatus: otp.deliveryStatus, codeLast2: otp.codeLast2 } });
    return otp;
  });
}
