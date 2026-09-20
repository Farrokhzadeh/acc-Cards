export type KripicardErrorKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "provider_rejected"
  | "provider_error"
  | "invalid_response"
  | "purchase_pending_refunded"
  | "refund_pending"
  | "operation_in_flight";

export type KripicardErrorMetadata = {
  providerCode?: string | null;
  pending?: boolean;
  safeToRetry?: boolean;
  retryAfterSeconds?: number | null;
  rateLimitScope?: string | null;
  rateLimit?: number | null;
};

export class KripicardError extends Error {
  constructor(
    public readonly kind: KripicardErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly metadata: KripicardErrorMetadata = {},
  ) {
    super(message);
    this.name = "KripicardError";
  }
}
