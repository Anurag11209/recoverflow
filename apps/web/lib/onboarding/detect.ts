/**
 * Onboarding connection detection.
 *
 * A merchant is "connected" once RecoverFlow has received (and signature-
 * verified) its FIRST real webhook event from Razorpay — i.e. the earliest
 * PaymentEvent for that merchant. Modeled as a pure mapping plus an injectable
 * store so the detection logic is unit-testable without a database.
 */
export interface FirstWebhookEvent {
  eventType: string;
  receivedAt: Date;
}

export type ConnectionStatus =
  | { connected: false }
  | { connected: true; firstEvent: { eventType: string; receivedAt: string } };

/** Pure: map the merchant's earliest webhook event (or null) to a status. */
export function resolveConnectionStatus(firstEvent: FirstWebhookEvent | null): ConnectionStatus {
  if (!firstEvent) return { connected: false };
  return {
    connected: true,
    firstEvent: {
      eventType: firstEvent.eventType,
      receivedAt: firstEvent.receivedAt.toISOString(),
    },
  };
}

export interface OnboardingStore {
  /** The merchant's earliest received webhook event, or null if none yet. */
  findFirstWebhookEvent(merchantId: string): Promise<FirstWebhookEvent | null>;
}

/** Query + map: the merchant's current onboarding connection status. */
export async function getConnectionStatus(
  store: OnboardingStore,
  merchantId: string,
): Promise<ConnectionStatus> {
  const first = await store.findFirstWebhookEvent(merchantId);
  return resolveConnectionStatus(first);
}
