import { parseServerEnv } from "@/config/env-schema.mjs";
import { KripicardError } from "@/server/providers/kripicard/errors";
import {
  kripicardCardDetailsResponseSchema,
  kripicardCreateCardResponseSchema,
  kripicardFundCardResponseSchema,
  kripicardErrorResponseSchema,
  kripicardFreezeUnfreezeResponseSchema,
  kripicardListCardsResponseSchema,
  kripicardTransactionsResponseSchema,
  kripicardDepositCoinsResponseSchema,
  kripicardDepositNetworksResponseSchema,
  kripicardDepositCreateResponseSchema,
  kripicardDepositStatusResponseSchema,
} from "@/server/providers/kripicard/schemas";
import type { ZodTypeAny, output } from "zod";

export type KripicardClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  readRetryCount?: number;
  readRetryBaseMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function safeProviderMessage(value: unknown) {
  if (typeof value !== "string") return "Kripicard rejected the request.";
  return value.slice(0, 240).replace(/[\r\n]+/g, " ");
}

export class KripicardClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly retryBaseMs: number;

  constructor(options: KripicardClientOptions) {
    const env = parseServerEnv(process.env);
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? env.KRIPICARD_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? env.KRIPICARD_REQUEST_TIMEOUT_MS;
    this.retryCount = options.readRetryCount ?? env.KRIPICARD_READ_RETRY_COUNT;
    this.retryBaseMs = options.readRetryBaseMs ?? env.KRIPICARD_READ_RETRY_BASE_MS;
  }

  listCards() {
    return this.read("/api/external/cards/list", {}, kripicardListCardsResponseSchema);
  }

  cardDetails(input: { cardId: string }) {
    return this.read("/api/external/cards/carddetails", { card_id: input.cardId }, kripicardCardDetailsResponseSchema);
  }

  transactions(input: { cardId: string }) {
    return this.read("/api/external/cards/transactions", { card_id: input.cardId }, kripicardTransactionsResponseSchema);
  }

  depositCoins() {
    return this.read("/api/external/deposits/coins", {}, kripicardDepositCoinsResponseSchema);
  }

  depositNetworks(input: { currency: string }) {
    return this.read("/api/external/deposits/networks", { currency: input.currency }, kripicardDepositNetworksResponseSchema);
  }

  depositStatus(input: { id: string }) {
    return this.read("/api/external/deposits/status", { id: input.id }, kripicardDepositStatusResponseSchema);
  }

  createDeposit(input: { amount: number; currency: string; network: string; orderId: string }) {
    return this.write(
      "/api/external/deposits/create",
      { amount: input.amount, currency: input.currency, network: input.network, order_id: input.orderId },
      kripicardDepositCreateResponseSchema,
    );
  }

  createCard(input: {
    bin: string;
    amount: number;
    nameOnCard: string;
    email?: string | null;
    dateOfBirth?: string | null;
  }) {
    return this.write(
      "/api/external/cards/createcard",
      {
        bin: input.bin,
        amount: input.amount,
        name_on_card: input.nameOnCard,
        ...(input.email ? { email: input.email } : {}),
        ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
      },
      kripicardCreateCardResponseSchema,
    );
  }

  fundCard(input: { cardId: string; amount: number }) {
    return this.write(
      "/api/external/cards/fundcard",
      { card_id: input.cardId, amount: input.amount },
      kripicardFundCardResponseSchema,
    );
  }

  freezeUnfreeze(input: { cardId: string; action: "freeze" | "unfreeze" }) {
    return this.write(
      "/api/external/premium/Freeze_Unfreeze",
      { card_id: input.cardId, action: input.action },
      kripicardFreezeUnfreezeResponseSchema,
    );
  }

  private write<TSchema extends ZodTypeAny>(path: string, body: Record<string, unknown>, schema: TSchema): Promise<output<TSchema>> {
    return this.requestOnce(path, body, schema);
  }

  private async read<TSchema extends ZodTypeAny>(path: string, body: Record<string, unknown>, schema: TSchema): Promise<output<TSchema>> {
    let lastError: KripicardError | null = null;
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this.requestOnce(path, body, schema);
      } catch (error) {
        const providerError = error instanceof KripicardError ? error : new KripicardError("network", "Kripicard request failed.", undefined, true);
        lastError = providerError;
        if (!providerError.retryable || attempt >= this.retryCount) throw providerError;
        const retryAfterMs = Math.max(0, providerError.metadata.retryAfterSeconds ?? 0) * 1000;
        await sleep(Math.max(retryAfterMs, this.retryBaseMs * 2 ** attempt));
      }
    }
    throw lastError ?? new KripicardError("provider_error", "Kripicard request failed.");
  }

  private async requestOnce<TSchema extends ZodTypeAny>(path: string, body: Record<string, unknown>, schema: TSchema): Promise<output<TSchema>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ api_key: this.apiKey, ...body }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new KripicardError("timeout", "Kripicard request timed out.", undefined, true, { safeToRetry: false });
      }
      throw new KripicardError("network", "Kripicard could not be reached.", undefined, true, { safeToRetry: false });
    } finally {
      clearTimeout(timer);
    }

    const raw: unknown = await response.json().catch(() => null);
    const providerFailure = kripicardErrorResponseSchema.safeParse(raw);
    const retryAfterHeader = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    if (providerFailure.success && response.status === 202 && providerFailure.data.pending === true) {
      const metadata = {
        providerCode: providerFailure.data.code ?? null,
        pending: true,
        safeToRetry: false,
      };
      if (providerFailure.data.code === "REFUND_PENDING") {
        throw new KripicardError("refund_pending", safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error), 202, false, metadata);
      }
      throw new KripicardError("purchase_pending_refunded", safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error), 202, false, metadata);
    }

    if (providerFailure.success && providerFailure.data.code === "OPERATION_IN_FLIGHT") {
      throw new KripicardError(
        "operation_in_flight",
        safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error),
        response.status,
        false,
        { providerCode: providerFailure.data.code, safeToRetry: false },
      );
    }

    if (response.status === 429) {
      const seconds = providerFailure.success
        ? providerFailure.data.retry_after_seconds ?? (Number.isFinite(retryAfterHeader) ? retryAfterHeader : null)
        : (Number.isFinite(retryAfterHeader) ? retryAfterHeader : null);
      const message = providerFailure.success ? safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error) : "Kripicard rate limit reached.";
      throw new KripicardError("rate_limited", message, 429, true, {
        safeToRetry: true,
        retryAfterSeconds: seconds,
        rateLimitScope: providerFailure.success ? providerFailure.data.scope ?? null : null,
        rateLimit: providerFailure.success ? providerFailure.data.limit ?? null : null,
      });
    }

    if (!response.ok) {
      const message = providerFailure.success ? safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error) : `Kripicard returned HTTP ${response.status}.`;
      if (response.status >= 500) {
        throw new KripicardError("provider_error", message, response.status, true, { safeToRetry: false });
      }
      throw new KripicardError("provider_rejected", message, response.status, false, {
        providerCode: providerFailure.success ? providerFailure.data.code ?? null : null,
        safeToRetry: providerFailure.success ? providerFailure.data.pending !== true : false,
      });
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      if (providerFailure.success) {
        throw new KripicardError(
          "provider_rejected",
          safeProviderMessage(providerFailure.data.message ?? providerFailure.data.error),
          response.status,
          false,
          { providerCode: providerFailure.data.code ?? null, pending: providerFailure.data.pending, safeToRetry: providerFailure.data.pending !== true },
        );
      }
      throw new KripicardError("invalid_response", "Kripicard returned an unexpected response shape.", response.status, false, { safeToRetry: false });
    }
    return parsed.data;
  }

}
