-- AlterTable
-- Additive: the `created` time of the most recent Stripe event applied to this
-- BillingSubscription, used as an out-of-order guard. Nullable; existing rows
-- are unaffected.
ALTER TABLE "BillingSubscription" ADD COLUMN "lastStripeEventAt" TIMESTAMP(3);
