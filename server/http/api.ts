import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readOnlyModeEnabled } from "@/server/operations/controls";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { applyApiSecurityHeaders } from "@/server/http/security-headers";
import { consumeApiRateLimit } from "@/server/security/rate-limit";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type PgLikeError = Error & { code?: string; constraint?: string };

function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) return supplied;
  return randomUUID();
}

function mapDatabaseError(error: PgLikeError): ApiError | null {
  switch (error.code) {
    case "23505":
      return new ApiError(409, "conflict", "The requested change conflicts with an existing record.");
    case "23503":
      return new ApiError(409, "conflict", "The requested change conflicts with related records.");
    case "22P02":
      return new ApiError(400, "validation_error", "One or more identifiers are invalid.");
    case "57014":
      return new ApiError(503, "database_timeout", "The database operation timed out.");
    default:
      return null;
  }
}

export function jsonData(data: unknown, requestId: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  applyApiSecurityHeaders(headers);
  return Response.json({ data, requestId }, { ...init, headers });
}

export async function apiRoute(
  request: Request,
  handler: (context: { requestId: string }) => Promise<Response | unknown>,
) {
  const requestId = requestIdFrom(request);
  try {
    const method = request.method.toUpperCase();
    const pathname = new URL(request.url).pathname;
    const contentLength = request.headers.get("content-length");
    const maxBodyBytes = parseServerEnv(process.env).API_MAX_BODY_BYTES;
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBodyBytes)) {
      throw new ApiError(413, "payload_too_large", "The request body is too large.");
    }
    const rateLimit = await consumeApiRateLimit(request);
    if (!rateLimit.allowed) {
      throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }
    const callbackMutation = pathname === "/api/v1/email/outlook/callback" || pathname === "/api/v1/email/gmail/callback";
    if (!["GET", "HEAD", "OPTIONS"].includes(method) || callbackMutation) {
      const recoveryAccess = pathname.startsWith("/api/v1/auth/") || pathname.startsWith("/api/v1/operations/controls/");
      if (!recoveryAccess && await readOnlyModeEnabled()) {
        throw new ApiError(503, "read_only_mode", "AccAbad is in emergency read-only mode. This change was not applied.");
      }
    }
    const result = await handler({ requestId });
    if (result instanceof Response) {
      result.headers.set("x-request-id", requestId);
      applyApiSecurityHeaders(result.headers);
      return result;
    }
    return jsonData(result, requestId);
  } catch (error) {
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else if (error instanceof z.ZodError) {
      apiError = new ApiError(400, "validation_error", "The request is invalid.", error.flatten());
    } else if (error instanceof Error) {
      apiError = mapDatabaseError(error as PgLikeError) ?? new ApiError(500, "internal_error", "An unexpected server error occurred.");
      console.error("[api] request failed", {
        requestId,
        errorName: error.name,
        errorCode: (error as PgLikeError).code,
      });
    } else {
      apiError = new ApiError(500, "internal_error", "An unexpected server error occurred.");
      console.error("[api] request failed", { requestId, errorName: "unknown" });
    }

    const headers = applyApiSecurityHeaders(new Headers({ "x-request-id": requestId }));
    if (apiError.status === 429 && typeof apiError.details === "object" && apiError.details) {
      const retryAfter = (apiError.details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
      if (typeof retryAfter === "number") headers.set("retry-after", String(retryAfter));
    }
    return Response.json(
      {
        error: {
          code: apiError.code,
          message: apiError.message,
          details: apiError.details,
          requestId,
        },
      },
      { status: apiError.status, headers },
    );
  }
}
