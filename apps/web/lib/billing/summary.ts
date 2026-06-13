import type { BillingStatus, PlanTier } from '@recoverflow/db';

/**
 * The coarse UI states the billing page renders. Maps the finer BillingStatus
 * enum down to the four states the dashboard cares about. INCOMPLETE (checkout
 * started but never paid) and TRIALING fold into the obvious buckets so the page
 * never has to branch on the raw enum.
 */
export type BillingState = 'none' | 'active' | 'past_due' | 'canceled';

export interface BillingRow {
  plan: PlanTier;
  status: BillingStatus;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingView {
  state: BillingState;
  /** Human-readable status, e.g. "Active", "Past due", "No subscription". */
  statusLabel: string;
  /** The active plan tier, or null when there is no subscription. */
  plan: PlanTier | null;
  /** Renewal/cancellation line, e.g. "Renews on July 1, 2026", or null. */
  renewalLabel: string | null;
  /** Whether to offer the Stripe Billing Portal (a Stripe customer exists). */
  canManageBilling: boolean;
}

const STATUS_LABELS: Record<BillingStatus, string> = {
  INCOMPLETE: 'Incomplete',
  TRIALING: 'Trialing',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELED: 'Canceled',
};

/** UTC so server-rendered dates are deterministic regardless of host timezone. */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function stateFor(status: BillingStatus): BillingState {
  switch (status) {
    case 'ACTIVE':
    case 'TRIALING':
      return 'active';
    case 'PAST_DUE':
      return 'past_due';
    case 'CANCELED':
      return 'canceled';
    // INCOMPLETE — checkout never completed; treat as having no subscription.
    default:
      return 'none';
  }
}

/**
 * Derives everything the billing page needs to render the current-subscription
 * panel from a BillingSubscription row (or null). Pure and side-effect-free so
 * the UI stays a thin presenter and the state logic is unit-tested in isolation.
 */
export function billingView(row: BillingRow | null): BillingView {
  if (!row) {
    return {
      state: 'none',
      statusLabel: 'No subscription',
      plan: null,
      renewalLabel: null,
      canManageBilling: false,
    };
  }

  const state = stateFor(row.status);
  const hasCustomer = Boolean(row.stripeCustomerId);

  let renewalLabel: string | null = null;
  if ((state === 'active' || state === 'past_due') && row.currentPeriodEnd) {
    renewalLabel = row.cancelAtPeriodEnd
      ? `Cancels on ${formatDate(row.currentPeriodEnd)}`
      : `Renews on ${formatDate(row.currentPeriodEnd)}`;
  }

  return {
    state,
    statusLabel: state === 'none' ? 'No subscription' : STATUS_LABELS[row.status],
    plan: state === 'none' ? null : row.plan,
    renewalLabel,
    // The portal needs a Stripe customer; only offer it once one exists and the
    // merchant has actually subscribed (not the INCOMPLETE/none state).
    canManageBilling: state !== 'none' && hasCustomer,
  };
}
