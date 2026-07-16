import { z } from 'zod';

/**
 * Server-side environment validation.
 *
 * Import this module ONLY from server code (route handlers, server components,
 * scripts) — it validates secrets such as DATABASE_URL that must never reach
 * the browser. Validation runs once at import and fails fast with a readable
 * error.
 *
 * Set SKIP_ENV_VALIDATION=true to bypass (e.g. building a Docker image where
 * env is injected at runtime, not build time).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  // Server-side canonical base URL for links embedded in outbound messages
  // (e.g. WhatsApp payment-update links). Distinct from NEXT_PUBLIC_APP_URL,
  // which is the browser-facing origin. Defaults to localhost for dev/test so
  // it need not be set in every environment (avoids env blast radius).
  APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL').default('http://localhost:3000'),
  MESSAGING_PROVIDER: z.enum(['console']).default('console'),
  // Required at boot: the app encrypts per-merchant Razorpay webhook secrets at
  // rest (AES-256-GCM), so a valid key must be present before any request is
  // served. Validated here (presence + 32-byte length) so a missing or malformed
  // key fails fast at boot — via `check:env` and the instrumentation boot hook —
  // rather than lazily on the first webhook that needs to decrypt.
  APP_ENCRYPTION_KEY: z
    .string({
      required_error:
        'APP_ENCRYPTION_KEY is required (AES-256); generate with: openssl rand -base64 32',
    })
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message:
        'APP_ENCRYPTION_KEY must decode to 32 bytes (AES-256); generate with: openssl rand -base64 32',
    }),
  // Stripe billing (M4). All optional at load time so dev/test/CI environments
  // that never call Stripe still load; presence is enforced where actually used
  // (checkout, webhook verification). Populated with test-mode values in M4-2/3.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  if (input.SKIP_ENV_VALIDATION === 'true' || input.SKIP_ENV_VALIDATION === '1') {
    return input as unknown as Env;
  }
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}

// Lazily evaluate via a FUNCTION (not a Proxy/const). `next build` collects page
// data by importing route modules; anything evaluated at import time runs during
// the build, where Railway does not inject service variables. A Proxy still gets
// "touched" by the bundler when re-exported through the barrel (property/enumeration
// probes trigger the trap -> loadEnv() -> throw). A plain function is never probed:
// validation runs ONLY when getEnv() is explicitly CALLED, which all call sites do
// inside request-time functions. The result is cached after first call.
let cachedEnv: Env | null = null;
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

export { envSchema };
