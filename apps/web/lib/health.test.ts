import { describe, expect, it } from 'vitest';
import { buildHealth } from './health';

describe('buildHealth', () => {
  it('reports ok with a service name and ISO timestamp', () => {
    const health = buildHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('recoverflow-web');
    expect(() => new Date(health.timestamp).toISOString()).not.toThrow();
  });
});
