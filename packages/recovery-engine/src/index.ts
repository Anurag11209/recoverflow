/**
 * @recoverflow/recovery-engine
 *
 * Domain layer for failed-payment recovery. Phase 1 only establishes the
 * package boundary so other packages can depend on it. Retry scheduling and
 * orchestration are implemented in Phase 5 (Recovery Engine).
 */
export const RECOVERY_ENGINE_VERSION = '0.1.0';
