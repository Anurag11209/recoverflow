import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { getRecoveryCaseDetail } from './case-detail';

async function clean() {
  await prisma.paymentUpdateToken.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.recoveryAttempt.deleteMany();
  await prisma.recoveryCase.deleteMany();
  await prisma.eventProcessing.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.webhookReceipt.deleteMany();
  await prisma.merchant.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

let seq = 0;

async function seedMerchant(name: string) {
  return prisma.merchant.create({ data: { name, email: `cd-${++seq}@test.local` } });
}

const at = (min: number) => new Date(`2026-06-01T00:${String(min).padStart(2, '0')}:00Z`);

/**
 * Seed a full case: PaymentEvent -> RecoveryCase -> one attempt -> one message,
 * with explicit createdAt values so timeline ordering is deterministic. Returns
 * the case token.
 */
async function seedFullCase(
  merchantId: string,
  opts: { recovered?: boolean } = {},
): Promise<string> {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: `evt_cd_${++seq}`,
      eventType: 'payment.failed',
      merchantId,
      payload: {},
      signatureVerified: true,
    },
  });
  const rc = await prisma.recoveryCase.create({
    data: {
      paymentEventId: pe.id,
      merchantId,
      provider: 'razorpay',
      status: opts.recovered ? 'RECOVERED' : 'OPEN',
      amount: 499,
      currency: 'INR',
      failureCategory: 'INSUFFICIENT_FUNDS',
      failureReason: 'Insufficient funds',
      customerEmail: 'cust@example.com',
      createdAt: at(1),
      ...(opts.recovered ? { recoveredAmount: 499, recoveredAt: at(4) } : {}),
    },
  });
  const attempt = await prisma.recoveryAttempt.create({
    data: {
      recoveryCaseId: rc.id,
      attemptNumber: 1,
      status: 'SUCCESS',
      scheduledAt: at(2),
      createdAt: at(2),
    },
  });
  await prisma.messageLog.create({
    data: {
      recoveryCaseId: rc.id,
      recoveryAttemptId: attempt.id,
      merchantId,
      messageType: 'PAYMENT_FAILED',
      provider: 'console',
      templateName: 'PAYMENT_FAILED',
      recipientPhone: '+919876543210',
      status: 'SENT',
      createdAt: at(3),
    },
  });
  return rc.token;
}

describe('getRecoveryCaseDetail (integration)', () => {
  it('returns null for an unknown token', async () => {
    const m = await seedMerchant('Unknown');
    expect(await getRecoveryCaseDetail(m.id, 'tok_does_not_exist')).toBeNull();
  });

  it('looks up a case by token with its attempts and messages', async () => {
    const m = await seedMerchant('Lookup');
    const token = await seedFullCase(m.id);

    const detail = await getRecoveryCaseDetail(m.id, token);
    expect(detail).not.toBeNull();
    expect(detail!.summary.token).toBe(token);
    expect(detail!.summary.amount).toBe('499');
    expect(detail!.summary.failureCategory).toBe('INSUFFICIENT_FUNDS');
    expect(detail!.attempts).toHaveLength(1);
    expect(detail!.attempts[0]!.attemptNumber).toBe(1);
    expect(detail!.messages).toHaveLength(1);
    expect(detail!.messages[0]!.messageType).toBe('PAYMENT_FAILED');
  });

  it('builds a chronological timeline (created -> attempt -> message -> recovered)', async () => {
    const m = await seedMerchant('Timeline');
    const token = await seedFullCase(m.id, { recovered: true });

    const detail = await getRecoveryCaseDetail(m.id, token);
    const kinds = detail!.timeline.map((e) => e.kind);
    expect(kinds).toEqual(['case_created', 'attempt_created', 'message_sent', 'payment_recovered']);
    // strictly ascending timestamps
    const times = detail!.timeline.map((e) => e.at.getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    }
  });

  it("is merchant-scoped: merchant A cannot read merchant B's case by token", async () => {
    const a = await seedMerchant('A');
    const b = await seedMerchant('B');
    const tokenB = await seedFullCase(b.id);

    // B sees it; A does not (same valid token, wrong merchant -> null).
    expect(await getRecoveryCaseDetail(b.id, tokenB)).not.toBeNull();
    expect(await getRecoveryCaseDetail(a.id, tokenB)).toBeNull();
  });
});
