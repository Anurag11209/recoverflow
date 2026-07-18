import type { PlanTier } from '@recoverflow/db';
import type { EmailClient } from '@recoverflow/adapters';
import { PLANS } from './plans';
import { startOfMonthUTC } from './plan-limits';

/** UTC month key, e.g. "2026-07" — the once-per-period dedup key. */
export function periodKey(now: Date): string {
  const d = startOfMonthUTC(now);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}`;
}

export interface PlanLimitNoticeStore {
  /**
   * Atomically record that this merchant was notified for `period`. Returns true
   * iff THIS call created the row (won the once-per-period claim); false if a
   * notice already existed. The atomic claim is what makes the email at-most-once
   * per period even under concurrent drops.
   */
  claimNotice(merchantId: string, period: string): Promise<boolean>;
}

interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export interface NotifyLimitDeps {
  store: PlanLimitNoticeStore;
  emailClient: EmailClient;
  findMerchantEmail(merchantId: string): Promise<string | null>;
  buildUpgradeUrl(): string;
  logger: Logger;
}

export interface NotifyLimitInput {
  merchantId: string;
  plan: PlanTier;
  limit: number;
  now: Date;
}

export type NotifyLimitOutcome = 'notified' | 'already_notified' | 'skipped_no_email';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildLimitEmail(input: { planName: string; limit: number; upgradeUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You've reached your ${input.planName} plan limit`;
  const cap = input.limit.toLocaleString('en-US');
  const url = esc(input.upgradeUrl);
  const html = `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;font-weight:600;letter-spacing:-.01em;color:#6b7280;margin:0 0 16px">RecoverFlow</p>
    <h1 style="font-size:20px;margin:0 0 12px">You've reached your ${esc(input.planName)} plan limit</h1>
    <p style="font-size:15px;line-height:1.5;margin:0">You've used all ${cap} failed-payment recoveries included in your ${esc(
      input.planName,
    )} plan this month. New failed payments beyond the limit are <strong>not being recovered</strong> until the period resets or you upgrade.</p>
    <p style="margin:24px 0"><a href="${url}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">Upgrade your plan</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">You're receiving this because your account hit its monthly limit. We send this at most once per month.</p>
  </div>
</body></html>`;
  const text = `RecoverFlow\n\nYou've reached your ${input.planName} plan limit.\n\nYou've used all ${cap} failed-payment recoveries included in your ${input.planName} plan this month. New failed payments beyond the limit are not being recovered until the period resets or you upgrade.\n\nUpgrade your plan: ${input.upgradeUrl}`;
  return { subject, html, text };
}

/**
 * Send the "plan limit reached" email at most once per merchant per period.
 * The atomic claim gates the send, so repeated drops in the same month never
 * re-email. Intended to be called best-effort from ingestion — the caller
 * contains any failure so a notification problem never breaks the webhook ack.
 */
export async function notifyPlanLimitReached(
  deps: NotifyLimitDeps,
  input: NotifyLimitInput,
): Promise<NotifyLimitOutcome> {
  const period = periodKey(input.now);
  const won = await deps.store.claimNotice(input.merchantId, period);
  if (!won) return 'already_notified';

  const email = await deps.findMerchantEmail(input.merchantId);
  if (!email) {
    deps.logger.error(
      { event: 'plan_limit_notice_no_email', merchantId: input.merchantId, period },
      'plan limit reached but merchant has no email; in-app banner still shown',
    );
    return 'skipped_no_email';
  }

  const { subject, html, text } = buildLimitEmail({
    planName: PLANS[input.plan].name,
    limit: input.limit,
    upgradeUrl: deps.buildUpgradeUrl(),
  });
  await deps.emailClient.sendEmail({ to: email, subject, html, text });

  deps.logger.info(
    { event: 'plan_limit_notified', merchantId: input.merchantId, period, plan: input.plan },
    'plan limit reached email sent',
  );
  return 'notified';
}
