import { z } from "zod";
import { ApiError, apiRoute } from "@/server/http/api";
import { completeLoginMfa, currentMfaChallenge } from "@/server/auth/service";
import { authenticatedResponse } from "@/server/auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const challenge = currentMfaChallenge(request);
    if (!challenge) throw new ApiError(401, "invalid_mfa_challenge", "The MFA challenge is missing or expired.");
    const body = schema.parse(await request.json());
    const result = await completeLoginMfa(challenge, body.code, request);
    return authenticatedResponse(
      { mfaRequired: false, admin: result.principal },
      requestId,
      result.sessionToken,
      result.csrfToken,
      result.maxAgeSeconds,
    );
  });
}
