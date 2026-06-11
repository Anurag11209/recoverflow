/**
 * Minimal structured-logger port. The engine logs through this interface so it
 * stays decoupled from Pino specifically (ADR 0001); apps/web injects the real
 * @recoverflow/shared logger, tests inject a no-op or spy.
 */
export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}
