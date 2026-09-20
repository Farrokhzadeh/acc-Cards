import { z } from "zod";

const money = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform((value) => Number(value));

export const kripicardListCardSchema = z.object({
  card_id: z.string().min(1),
  name_on_card: z.string().nullish(),
  last4: z.string().regex(/^\d{4}$/).nullish(),
  card_brand: z.string().nullish(),
  card_type: z.string().nullish(),
  status: z.string().min(1),
  balance: money.nullish(),
  created_at: z.string().nullish(),
}).passthrough();

export const kripicardListCardsResponseSchema = z.object({
  success: z.literal(true),
  total: z.number().int().nonnegative().optional(),
  data: z.array(kripicardListCardSchema),
}).passthrough();

export const kripicardCardDetailsResponseSchema = z.object({
  success: z.literal(true),
  card_number: z.string().regex(/^\d{12,19}$/),
  expiry: z.string().regex(/^\d{2}\/\d{2,4}$/),
  cvv: z.string().regex(/^\d{3,4}$/),
  balance: money,
  status: z.string().min(1),
}).passthrough();

export const kripicardTransactionSchema = z.object({
  date: z.string().min(1),
  type: z.string().min(1),
  merchant: z.string().nullish(),
  amount: money,
  currency: z.string().length(3),
  status: z.string().min(1),
  reason: z.string().nullish(),
  reason_code: z.string().nullish(),
  reason_source: z.string().nullish(),
}).passthrough();

export const kripicardTransactionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    card_id: z.string().min(1),
    balance: money,
    total_transactions: z.number().int().nonnegative().optional(),
    transactions: z.array(kripicardTransactionSchema),
  }).passthrough(),
}).passthrough();



export const kripicardCreateCardResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  card_id: z.string().min(1),
  last_4: z.string().regex(/^\d{4}$/),
  bin: z.string().regex(/^\d{6}$/),
  amount: money,
  fee: money,
  total_charged: money,
}).passthrough();


export const kripicardFundCardResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  data: z.object({
    card_id: z.string().min(1),
    amount: money,
    fee: money,
    total_debited: money,
  }).passthrough(),
}).passthrough();

export const kripicardFreezeUnfreezeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
}).passthrough();

export const kripicardErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string().optional(),
  error: z.string().optional(),
  pending: z.boolean().optional(),
  code: z.string().optional(),
  scope: z.enum(["burst", "sustained", "write", "ip"]).optional(),
  retry_after_seconds: z.number().int().nonnegative().optional(),
  retry_after_minutes: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
}).passthrough();

export type KripicardListCard = z.infer<typeof kripicardListCardSchema>;
export type KripicardCardDetails = z.infer<typeof kripicardCardDetailsResponseSchema>;
export type KripicardTransaction = z.infer<typeof kripicardTransactionSchema>;
export type KripicardCreateCardResponse = z.infer<typeof kripicardCreateCardResponseSchema>;
export type KripicardFundCardResponse = z.infer<typeof kripicardFundCardResponseSchema>;

export const kripicardDepositCoinSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  networks_count: z.number().int().nonnegative(),
}).passthrough();

export const kripicardDepositCoinsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(kripicardDepositCoinSchema),
}).passthrough();

export const kripicardDepositNetworkSchema = z.object({
  network: z.string().min(1),
  name: z.string().min(1),
  min_amount: money,
}).passthrough();

export const kripicardDepositNetworksResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    currency: z.string().min(1),
    networks: z.array(kripicardDepositNetworkSchema),
  }).passthrough(),
}).passthrough();

export const kripicardDepositCreateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().min(1),
    status: z.literal("pending"),
    amount_usd: money,
    fee_usd: money,
    credited_on_completion_usd: money,
    pay_address: z.string().min(1),
    pay_amount: z.string().regex(/^\d+(?:\.\d+)?$/),
    pay_currency: z.string().min(1),
    network: z.string().min(1),
    expires_at: z.string().datetime({ offset: true }),
  }).passthrough(),
}).passthrough();

export const kripicardDepositStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().min(1),
    status: z.enum(["pending", "completed", "failed"]),
    amount_usd: money,
    fee_usd: money,
    credited: z.boolean().optional(),
    credited_amount_usd: money.optional(),
    pay_currency: z.string().min(1),
    network: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
  }).passthrough(),
}).passthrough();

export type KripicardDepositCoin = z.infer<typeof kripicardDepositCoinSchema>;
export type KripicardDepositNetwork = z.infer<typeof kripicardDepositNetworkSchema>;
export type KripicardDepositCreateResponse = z.infer<typeof kripicardDepositCreateResponseSchema>;
export type KripicardDepositStatusResponse = z.infer<typeof kripicardDepositStatusResponseSchema>;
