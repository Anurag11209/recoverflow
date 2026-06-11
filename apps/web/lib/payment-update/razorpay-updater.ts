import { randomBytes } from 'node:crypto';
import type { PaymentMethodUpdater, UpdatePaymentMethodResult } from '@recoverflow/recovery-engine';

/**
 * SIMULATED Razorpay payment-method updater (Phase 7, D3). Real card-on-file
 * updates require PCI scope and processor onboarding RecoverFlow does not yet
 * have, so this collects no card data and performs no real Razorpay call. It
 * returns a simulated success so the recovery flow is exercised end-to-end; the
 * result is flagged simulated: true. Swapping in a real implementation later is
 * a drop-in replacement behind the PaymentMethodUpdater port.
 */
export function createRazorpayPaymentUpdater(): PaymentMethodUpdater {
  return {
    async updatePaymentMethod(): Promise<UpdatePaymentMethodResult> {
      return {
        success: true,
        simulated: true,
        providerReference: `sim_${randomBytes(8).toString('hex')}`,
      };
    },
  };
}
