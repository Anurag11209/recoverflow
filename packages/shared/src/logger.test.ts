import { describe, expect, it } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('exposes standard levels and never throws (incl. redaction config)', () => {
    expect(typeof logger.info).toBe('function');
    expect(() => logger.info({ password: 'hunter2', ok: true }, 'logger smoke test')).not.toThrow();
    expect(() => logger.error({ err: new Error('boom') }, 'error smoke test')).not.toThrow();
  });
});
