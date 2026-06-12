import { describe, expect, it } from 'vitest';
import { isNavItemActive, pageTitleFor, NAV_ITEMS } from './nav-items';

describe('isNavItemActive', () => {
  it('Overview is active only on the exact /dashboard path', () => {
    expect(isNavItemActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavItemActive('/dashboard/cases', '/dashboard')).toBe(false);
    expect(isNavItemActive('/dashboard/analytics', '/dashboard')).toBe(false);
  });

  it('Recovery Cases is active on the list and on a case detail route', () => {
    expect(isNavItemActive('/dashboard/cases', '/dashboard/cases')).toBe(true);
    expect(isNavItemActive('/dashboard/cases/tok_abc123', '/dashboard/cases')).toBe(true);
  });

  it('Analytics is active on the analytics route', () => {
    expect(isNavItemActive('/dashboard/analytics', '/dashboard/analytics')).toBe(true);
    expect(isNavItemActive('/dashboard/cases', '/dashboard/analytics')).toBe(false);
  });

  it('does not let a sibling prefix collide (cases vs casesX)', () => {
    // startsWith uses a trailing slash, so /dashboard/casesfoo never matches.
    expect(isNavItemActive('/dashboard/casesfoo', '/dashboard/cases')).toBe(false);
  });
});

describe('pageTitleFor', () => {
  it('maps each route to its nav label', () => {
    expect(pageTitleFor('/dashboard')).toBe('Overview');
    expect(pageTitleFor('/dashboard/cases')).toBe('Recovery Cases');
    expect(pageTitleFor('/dashboard/cases/tok_abc')).toBe('Recovery Cases');
    expect(pageTitleFor('/dashboard/analytics')).toBe('Analytics');
    expect(pageTitleFor('/dashboard/billing')).toBe('Billing');
    expect(pageTitleFor('/dashboard/settings')).toBe('Settings');
  });

  it('falls back to Dashboard for an unknown route', () => {
    expect(pageTitleFor('/dashboard/unknown')).toBe('Dashboard');
  });

  it('exposes the nav items in order', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      'Overview',
      'Recovery Cases',
      'Analytics',
      'Billing',
      'Settings',
    ]);
  });
});
