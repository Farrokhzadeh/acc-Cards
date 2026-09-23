import { z } from "zod";

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().min(1).optional());

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const schema = z
  .object({
    APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
    APP_BASE_URL: z.string().url(),
    APP_VERSION: z.string().min(1).default("phase24"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
    WORKER_LEASE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(5000).default(600),
    API_MUTATION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(5).max(2000).default(120),
    WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(1200),
    API_MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(12 * 1024 * 1024),

    KRIPICARD_BASE_URL: z.string().url().default("https://appapi.kripicard.com"),
    KRIPICARD_PORTAL_URL: z.string().url().default("https://app.kripicard.com"),
    KRIPICARD_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    KRIPICARD_READ_RETRY_COUNT: z.coerce.number().int().min(0).max(5).default(2),
    KRIPICARD_READ_RETRY_BASE_MS: z.coerce.number().int().min(50).max(5000).default(250),
    KRIPICARD_TRANSACTION_SYNC_JOB_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).optional()),
    KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
    KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),

    MICROSOFT_OAUTH_CLIENT_ID: optionalNonEmptyString,
    MICROSOFT_OAUTH_CLIENT_SECRET: optionalNonEmptyString,
    MICROSOFT_OAUTH_TENANT: z.string().min(1).default("consumers"),
    MICROSOFT_GRAPH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    OUTLOOK_SYNC_JOB_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).optional()),

    GOOGLE_OAUTH_CLIENT_ID: optionalNonEmptyString,
    GOOGLE_OAUTH_CLIENT_SECRET: optionalNonEmptyString,
    GOOGLE_GMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    GMAIL_SYNC_JOB_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).optional()),

    EMAIL_CLASSIFY_JOB_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).optional()),

    TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
    TELEGRAM_WEBHOOK_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/).optional()),
    TELEGRAM_OUTBOX_JOB_SECRET: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    }, z.string().min(32).optional()),
    TELEGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    TELEGRAM_CALLBACK_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
    TELEGRAM_SUPPORT_MODE_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),

    SUPPORT_ATTACHMENTS_STORAGE_DIR: z.string().min(1).default("/var/lib/accabad/support-attachments"),
    SUPPORT_ATTACHMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(10 * 1024 * 1024),

    RECEIPTS_STORAGE_DIR: z.string().min(1).default("/var/lib/accabad/receipts"),
    RECEIPT_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(10 * 1024 * 1024),
    RECEIPT_CLAMAV_HOST: z.string().max(253).optional().default(""),
    RECEIPT_CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    RECEIPT_CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
    RECEIPT_REQUIRE_ANTIVIRUS: booleanFromEnv.default(false),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(12),
    DATABASE_SSL_MODE: z.enum(["disable", "require"]).default("disable"),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(250).max(30000).default(3000),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(250).max(120000).default(10000),

    APP_ENCRYPTION_KEY: z.string().min(1),
    ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    ADMIN_REAUTH_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    REQUIRE_MFA_FOR_PRIVILEGED_ACTIONS: booleanFromEnv.default(true),
    ADMIN_MFA_CHALLENGE_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    ADMIN_LOGIN_RATE_MAX_FAILURES: z.coerce.number().int().min(3).max(50).default(5),
    ADMIN_LOGIN_RATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(120).default(15),

    ENABLE_LIVE_PROVIDER_WRITES: booleanFromEnv.default(false),
    ENABLE_KRIPICARD_CARD_STATE_WRITES: booleanFromEnv.default(false),
    ENABLE_KRIPICARD_CARD_CREATION: booleanFromEnv.default(false),
    ENABLE_KRIPICARD_CARD_FUNDING: booleanFromEnv.default(false),
    ENABLE_TELEGRAM_SENDS: booleanFromEnv.default(true),
    ENABLE_OUTLOOK_SYNC: booleanFromEnv.default(true),
    ENABLE_GMAIL_SYNC: booleanFromEnv.default(true),
    FORCE_READ_ONLY_MODE: booleanFromEnv.default(false),
    PRODUCTION_ROLLOUT_BLOCKED: booleanFromEnv.default(true),
    PRODUCTION_ROLLOUT_AUTHORIZATION: z.string().optional(),
    LIVE_PROVIDER_WRITE_CONFIRMATION: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    try {
      const key = Buffer.from(env.APP_ENCRYPTION_KEY, "base64");
      if (key.length !== 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_ENCRYPTION_KEY"],
          message: "APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ENCRYPTION_KEY"],
        message: "APP_ENCRYPTION_KEY must be valid base64.",
      });
    }

    if (
      env.ENABLE_LIVE_PROVIDER_WRITES &&
      env.LIVE_PROVIDER_WRITE_CONFIRMATION !== "ACCABAD_LIVE_WRITES_ENABLED"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LIVE_PROVIDER_WRITE_CONFIRMATION"],
        message:
          "Live provider writes require LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED.",
      });
    }

    if (Boolean(env.MICROSOFT_OAUTH_CLIENT_ID) !== Boolean(env.MICROSOFT_OAUTH_CLIENT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MICROSOFT_OAUTH_CLIENT_ID"],
        message: "MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET must be configured together.",
      });
    }


    if (Boolean(env.GOOGLE_OAUTH_CLIENT_ID) !== Boolean(env.GOOGLE_OAUTH_CLIENT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_OAUTH_CLIENT_ID"],
        message: "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be configured together.",
      });
    }

    if (Boolean(env.TELEGRAM_BOT_TOKEN) !== Boolean(env.TELEGRAM_WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be configured together.",
      });
    }

    if (env.ENABLE_KRIPICARD_CARD_STATE_WRITES && !env.ENABLE_LIVE_PROVIDER_WRITES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_KRIPICARD_CARD_STATE_WRITES"],
        message: "Kripicard card-state writes require ENABLE_LIVE_PROVIDER_WRITES=true.",
      });
    }

    if (env.ENABLE_KRIPICARD_CARD_CREATION && !env.ENABLE_LIVE_PROVIDER_WRITES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_KRIPICARD_CARD_CREATION"],
        message: "Kripicard card creation requires ENABLE_LIVE_PROVIDER_WRITES=true.",
      });
    }

    if (env.ENABLE_KRIPICARD_CARD_FUNDING && !env.ENABLE_LIVE_PROVIDER_WRITES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_KRIPICARD_CARD_FUNDING"],
        message: "Kripicard card funding requires ENABLE_LIVE_PROVIDER_WRITES=true.",
      });
    }

    if (
      env.APP_ENV === "production" &&
      /^(change|replace|password|example)/i.test(env.DATABASE_PASSWORD)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_PASSWORD"],
        message: "Production requires a non-placeholder PostgreSQL password.",
      });
    }

    if (env.APP_ENV === "production") {
      const baseUrl = new URL(env.APP_BASE_URL);
      if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.hash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_BASE_URL"],
          message: "Production APP_BASE_URL must be a credential-free HTTPS URL.",
        });
      }
      if (!env.RECEIPT_REQUIRE_ANTIVIRUS || !env.RECEIPT_CLAMAV_HOST?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RECEIPT_REQUIRE_ANTIVIRUS"],
          message: "Production requires fail-closed ClamAV scanning for private uploads.",
        });
      }
      if (!env.PRODUCTION_ROLLOUT_BLOCKED && env.PRODUCTION_ROLLOUT_AUTHORIZATION !== "PHASE24_RELEASE_AUTHORIZED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PRODUCTION_ROLLOUT_AUTHORIZATION"],
          message: "Unblocking production requires PRODUCTION_ROLLOUT_AUTHORIZATION=PHASE24_RELEASE_AUTHORIZED.",
        });
      }
    }
  });

export function parseServerEnv(input = process.env) {
  return schema.parse(input);
}

export function safeParseServerEnv(input = process.env) {
  return schema.safeParse(input);
}
