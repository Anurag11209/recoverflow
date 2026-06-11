import { validatePaymentToken } from '@/lib/payment-update/service';
import { PaymentUpdateForm } from './PaymentUpdateForm';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ token: string }> };

/** Format a major-unit amount string for display, e.g. ("499","INR") -> "₹499". */
function formatAmount(amount: string | null, currency: string | null): string | null {
  if (amount === null) return null;
  const symbol = currency === 'INR' ? '₹' : currency ? `${currency} ` : '';
  return `${symbol}${amount}`;
}

export default async function UpdatePaymentPage({ params }: PageProps) {
  const { token } = await params;
  const meta = await validatePaymentToken(token);

  if (!meta.valid) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-3 px-6">
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer available</h1>
        <p className="text-sm leading-relaxed text-gray-600">
          This payment update link can&apos;t be used. If you still need to update your payment,
          reply to the message you received and we&apos;ll send a new link.
        </p>
      </main>
    );
  }

  const display = formatAmount(meta.amount, meta.currency);
  const merchant = meta.merchantName ?? 'your subscription';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">{merchant}</p>
        <h1 className="text-xl font-semibold tracking-tight">Restore your payment</h1>
      </div>

      {/* Signature element: the amount, given room to be the trust anchor. */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-6">
        <p className="text-sm text-gray-500">Amount due</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
          {display ?? 'Amount on file'}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Your last payment to {merchant} didn&apos;t go through. Confirm below to retry it with
          your payment method on file.
        </p>
      </div>

      <PaymentUpdateForm token={token} />

      <p className="text-center text-xs leading-relaxed text-gray-400">
        Secured by RecoverFlow. This link is unique to you and can be used once.
      </p>
    </main>
  );
}
