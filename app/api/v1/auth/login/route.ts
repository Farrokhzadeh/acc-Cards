import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { loginWithPassword } from "@/server/auth/service";
import { authenticatedResponse, mfaChallengeResponse } from "@/server/auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const body = schema.parse(await request.json());
    const result = await loginWithPassword(body.email, body.password, request);
    if (result.mfaRequired) {
      return mfaChallengeResponse(
        { mfaRequired: true },
        requestId,
        result.challengeToken,
        result.challengeMaxAgeSeconds,
      );
    }
    return authenticatedResponse(
      { mfaRequired: false, admin: result.principal },
      requestId,
      result.sessionToken,
      result.csrfToken,
      result.maxAgeSeconds,
    );
  });
}
