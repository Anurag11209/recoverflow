import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { createWorker } from './worker';
import { createDefaultServices } from './deps';
import type { WorkerConfig } from './config';

// The ladder cap (3) is MAX_ATTEMPTS in recovery-engine, independent of this
// worker config's maxAttempts (which caps EventProcessing retries).
const CONFIG: WorkerConfig = {
  concurrency: 5,
  pollIntervalMs: 1000,
  maxAttempts: 5,
  backoffBaseMs: 1000,
  backoffMaxMs: 300_000,
  shutdownTimeoutMs: 30_000,
};

async function clean(): Promise<void> {
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

function worker() {
  return createWorker({ services: createDefaultServices(CONFIG), config: CONFIG });
}

/** Seed an OPEN case (createdAt = T0) with a due PENDING attempt #1. */
async function seedCaseWithDueAttempt1(providerEventId: string, createdAt: Date) {
  const merchant = await prisma.merchant.create({
    data: { name: 'Ladder Co', email: `l-${providerEventId}@test.local` },
  });
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId,
      eventType: 'payment.failed',
      merchantId: merchant.id,
      payload: { note: 'ladder seed' },
      signatureVerified: true,
    },
  });
  const rc = await prisma.recoveryCase.create({
    data: {
      paymentEventId: pe.id,
      merchantId: merchant.id,
      provider: 'razorpay',
      customerPhone: '+919999999999',
      amount: 499,
      currency: 'INR',
      failureCategory: 'INSUFFICIENT_FUNDS',
      status: 'OPEN',
      createdAt,
    },
  });
  await prisma.recoveryAttempt.create({
    data: { recoveryCaseId: rc.id, attemptNumber: 1, scheduledAt: createdAt, status: 'PENDING' },
  });
  return rc;
}

/** Push an attempt's scheduledAt into the past so the next drain treats it as due. */
async function makeDue(recoveryCaseId: string, attemptNumber: number): Promise<void> {
  await prisma.recoveryAttempt.update({
    where: { recoveryCaseId_attemptNumber: { recoveryCaseId, attemptNumber } },
    data: { scheduledAt: new Date(Date.now() - 60_000) },
  });
}

const hoursBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 3600_000);

describe('retry ladder (integration)', () => {
  it('climbs #1 -> #2 (+24h) -> #3 (+72h), caps at 3, marks the case FAILED', async () => {
    const createdAt = new Date();
    const rc = await seedCaseWithDueAttempt1('ladder_1', createdAt);

    // #1 due -> executes, schedules #2 at +24h (not yet due).
    await worker().drainToCompletion();
    let attempts = await prisma.recoveryAttempt.findMany({
      where: { recoveryCaseId: rc.id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(attempts[0]!.status).toBe('SUCCESS');
    expect(attempts[0]!.executedAt).not.toBeNull();
    expect(attempts[1]!.status).toBe('PENDING');
    expect(hoursBetween(attempts[1]!.scheduledAt, createdAt)).toBe(24);

    // #2 becomes due -> executes, schedules #3 at +72h.
    await makeDue(rc.id, 2);
    await worker().drainToCompletion();
    attempts = await prisma.recoveryAttempt.findMany({
      where: { recoveryCaseId: rc.id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
    expect(attempts[1]!.status).toBe('SUCCESS');
    expect(hoursBetween(attempts[2]!.scheduledAt, createdAt)).toBe(72);

    // #3 becomes due -> executes, no #4, case FAILED.
    await makeDue(rc.id, 3);
    await worker().drainToCompletion();
    attempts = await prisma.recoveryAttempt.findMany({ where: { recoveryCaseId: rc.id } });
    expect(attempts).toHaveLength(3); // cap: never a #4
    expect(attempts.find((a) => a.attemptNumber === 3)!.status).toBe('SUCCESS');
    const after = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: rc.id } });
    expect(after.status).toBe('FAILED');
  });

  it('halts the ladder when the case is already RECOVERED', async () => {
    const rc = await seedCaseWithDueAttempt1('ladder_halt', new Date());
    await prisma.recoveryCase.update({ where: { id: rc.id }, data: { status: 'RECOVERED' } });

    await worker().drainToCompletion();

    const attempts = await prisma.recoveryAttempt.findMany({ where: { recoveryCaseId: rc.id } });
    expect(attempts).toHaveLength(1); // no #2 scheduled
    expect(attempts[0]!.status).toBe('FAILED'); // due attempt marked skipped
    const msgs = await prisma.messageLog.findMany({ where: { recoveryCaseId: rc.id } });
    expect(msgs).toHaveLength(0); // nothing sent
    const after = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: rc.id } });
    expect(after.status).toBe('RECOVERED'); // unchanged
  });
});
