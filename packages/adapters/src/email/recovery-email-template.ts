import type { MessageTemplate } from '@recoverflow/recovery-engine';

/**
 * Render a recovery message (template + variables from the engine) into an email
 * subject and body. This is the email-channel counterpart to the WhatsApp
 * templates; it renders the SAME logical messages (PAYMENT_FAILED, CARD_EXPIRED,
 * PAYMENT_RECOVERED) as HTML + plain text.
 *
 * All interpolated values are HTML-escaped; the CTA link is only rendered when
 * it is a well-formed http(s) URL, so a malformed `updateUrl` can never inject
 * markup or a non-web scheme.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Human-readable amount, e.g. "INR 499" — or a generic phrase when unknown. */
function amountPhrase(vars: Record<string, string>): string {
  if (!vars.amount) return 'your payment';
  const currency = vars.currency ? `${vars.currency} ` : '';
  return `${currency}${vars.amount}`;
}

const SUBJECTS: Record<MessageTemplate, string> = {
  PAYMENT_FAILED: 'Your payment didn’t go through',
  CARD_EXPIRED: 'Your card on file has expired',
  PAYMENT_RECOVERED: 'Payment received — thank you',
};

const LEAD: Record<MessageTemplate, (amount: string) => string> = {
  PAYMENT_FAILED: (amount) =>
    `We couldn’t process ${amount}. You can retry it securely using the link below.`,
  CARD_EXPIRED: (amount) =>
    `The card we have on file has expired, so ${amount} didn’t go through. Update it using the link below.`,
  PAYMENT_RECOVERED: (amount) =>
    `We’ve received ${amount}. Your account is now up to date — no further action is needed.`,
};

export function renderRecoveryEmail(
  template: MessageTemplate,
  variables: Record<string, string>,
): RenderedEmail {
  const amount = amountPhrase(variables);
  const lead = LEAD[template](amount);
  const link = isHttpUrl(variables.updateUrl) ? variables.updateUrl : null;

  const ctaHtml = link
    ? `<p style="margin:24px 0"><a href="${esc(link)}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">Complete your payment</a></p>
       <p style="color:#6b7280;font-size:13px">Or paste this link into your browser:<br>${esc(link)}</p>`
    : '';
  const ctaText = link ? `\n\nComplete your payment: ${link}\n` : '\n';

  const html = `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;font-weight:600;letter-spacing:-.01em;color:#6b7280;margin:0 0 16px">RecoverFlow</p>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(SUBJECTS[template])}</h1>
    <p style="font-size:15px;line-height:1.5;margin:0">${esc(lead)}</p>
    ${ctaHtml}
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">If you didn’t expect this email, you can safely ignore it.</p>
  </div>
</body></html>`;

  const text = `RecoverFlow\n\n${SUBJECTS[template]}\n\n${lead}${ctaText}`;

  return { subject: SUBJECTS[template], html, text };
}
