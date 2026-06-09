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

export const env = loadEnv();
export { envSchema };
