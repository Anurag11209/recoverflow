/**
 * Abstraction over "update the customer's payment method with the processor"
 * (ADR 0001). The engine knows only this port; apps/web injects a concrete
 * implementation. Phase 7 ships a SIMULATED RazorpayPaymentUpdater (D3): real
 * card collection requires PCI scope and processor onboarding we do not have,
 * so the updater returns a simulated success and the recovery is architecturally
 * real while the money-movement is stubbed (result carries simulated: true).
 */
export interface UpdatePaymentMethodInput {
  recoveryCaseId: string;
  providerPaymentId: string | null;
  amount: number | null;
  currency: string | null;
}

export interface UpdatePaymentMethodResult {
  success: boolean;
  /** True when no real processor call was made (Phase 7 simulation). */
  simulated: boolean;
  /** A reference for the (simulated or real) update; always present on success. */
  providerReference: string;
}

export interface PaymentMethodUpdater {
  updatePaymentMethod(input: UpdatePaymentMethodInput): Promise<UpdatePaymentMethodResult>;
}
