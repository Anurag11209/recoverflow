import { describe, expect, it } from 'vitest';
import { computeUsageMeter } from './usage';

describe('computeUsageMeter (meter math)', () => {
  it('within the limit: partial percent, headroom, not exceeded', () => {
    expect(computeUsageMeter(250, 500)).toEqual({
      used: 250,
      limit: 500,
      remaining: 250,
      percent: 50,
      exceeded: false,
      unlimited: false,
    });
  });

  it('exactly at the limit: 100%, no headroom, not exceeded (still allowed)', () => {
    expect(computeUsageMeter(500, 500)).toEqual({
      used: 500,
      limit: 500,
      remaining: 0,
      percent: 100,
      exceeded: false,
      unlimited: false,
    });
  });

  it('over the limit: clamps percent to 100, remaining 0, exceeded', () => {
    expect(computeUsageMeter(650, 500)).toEqual({
      used: 650,
      limit: 500,
      remaining: 0,
      percent: 100,
      exceeded: true,
      unlimited: false,
    });
  });

  it('zero usage: 0%, full headroom', () => {
    expect(computeUsageMeter(0, 500)).toMatchObject({
      percent: 0,
      remaining: 500,
      exceeded: false,
    });
  });

  it('rounds the percentage', () => {
    expect(computeUsageMeter(1, 3).percent).toBe(33);
    expect(computeUsageMeter(2, 3).percent).toBe(67);
  });

  it('unlimited (null limit): never exceeded, percent 0, no remaining', () => {
    expect(computeUsageMeter(999_999, null)).toEqual({
      used: 999_999,
      limit: null,
      remaining: null,
      percent: 0,
      exceeded: false,
      unlimited: true,
    });
  });

  it('defensive zero-limit: 100% and exceeded once used', () => {
    expect(computeUsageMeter(1, 0)).toMatchObject({ percent: 100, exceeded: true, remaining: 0 });
    expect(computeUsageMeter(0, 0)).toMatchObject({ exceeded: false });
  });
});
