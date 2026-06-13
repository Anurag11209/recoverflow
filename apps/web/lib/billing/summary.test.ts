import { describe, expect, it } from 'vitest';
import { billingView, type BillingRow } from './summary';

function row(overrides: Partial<BillingRow>): BillingRow {
  return {
    plan: 'STARTER',
    status: 'ACTIVE',
    stripeCustomerId: 'cus_123',
    currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('billingView', () => {
  it('maps a null row to the no-subscription state', () => {
    const view = billingView(null);
    expect(view.state).toBe('none');
    expect(view.statusLabel).toBe('No subscription');
    expect(view.plan).toBeNull();
    expect(view.renewalLabel).toBeNull();
    expect(view.canManageBilling).toBe(false);
  });

  it('treats INCOMPLETE (checkout never paid) as no subscription', () => {
    const view = billingView(row({ status: 'INCOMPLETE' }));
    expect(view.state).toBe('none');
    expect(view.plan).toBeNull();
    // Even with a Stripe customer on file, an incomplete checkout offers no portal.
    expect(view.canManageBilling).toBe(false);
  });

  it('renders an active subscription with a renewal date and manage button', () => {
    const view = billingView(row({ status: 'ACTIVE', plan: 'GROWTH' }));
    expect(view.state).toBe('active');
    expect(view.statusLabel).toBe('Active');
    expect(view.plan).toBe('GROWTH');
    expect(view.renewalLabel).toBe('Renews on July 1, 2026');
    expect(view.canManageBilling).toBe(true);
  });

  it('shows "Cancels on" when the active subscription is set to cancel at period end', () => {
    const view = billingView(row({ status: 'ACTIVE', cancelAtPeriodEnd: true }));
    expect(view.renewalLabel).toBe('Cancels on July 1, 2026');
  });

  it('maps PAST_DUE to the past_due state while keeping the renewal line', () => {
    const view = billingView(row({ status: 'PAST_DUE' }));
    expect(view.state).toBe('past_due');
    expect(view.statusLabel).toBe('Past due');
    expect(view.renewalLabel).toBe('Renews on July 1, 2026');
    expect(view.canManageBilling).toBe(true);
  });

  it('maps CANCELED to the canceled state with no renewal line', () => {
    const view = billingView(row({ status: 'CANCELED' }));
    expect(view.state).toBe('canceled');
    expect(view.statusLabel).toBe('Canceled');
    expect(view.plan).toBe('STARTER');
    expect(view.renewalLabel).toBeNull();
    // A canceled merchant still has a Stripe customer and can reach the portal.
    expect(view.canManageBilling).toBe(true);
  });

  it('omits the manage button when no Stripe customer exists', () => {
    const view = billingView(row({ status: 'ACTIVE', stripeCustomerId: null }));
    expect(view.canManageBilling).toBe(false);
  });
});
