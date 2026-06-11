import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { processPaymentEvent } from '@recoverflow/recovery-engine';
import { logger } from '@recoverflow/shared';
import { createProcessingStore } from './store';

// FK-safe order. EventProcessing/IdempotencyRecord first, then PaymentEvent
// (EventProcessing references PaymentEvent; IdempotencyRecord is standalone).
async function clean() {
  await prisma.eventProcessing.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.webhookReceipt.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const store = createProcessingStore();

// Seed a PaymentEvent + its PENDING EventProcessing row, mimicking webhook ingest.
async function seedEvent(opts: { providerEventId: string; eventType?: string }) {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: opts.providerEventId,
      eventType: opts.eventType ?? 'payment.failed',
      payload: { event: opts.eventType ?? 'payment.failed' },
      signatureVerified: true,
    },
  });
  await prisma.eventProcessing.create({ data: { paymentEventId: pe.id, status: 'PENDING' } });
  return pe.id;
}

describe('event processing (integration)', () => {
  it('pending -> success: processes once, records idempotency, marks SUCCESS', async () => {
    const peId = await seedEvent({ providerEventId: 'evt_a' });

    const outcome = await processPaymentEvent(store, logger, peId);
    expect(outcome.status).toBe('SUCCESS');

    const ep = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: peId } });
    expect(ep.status).toBe('SUCCESS');
    expect(ep.attempts).toBe(1);
    expect(ep.completedAt).not.toBeNull();

    expect(await prisma.idempotencyRecord.count()).toBe(1);
  });

  it('duplicate processing blocked: second run is SKIPPED already_succeeded, still one row', async () => {
    const peId = await seedEvent({ providerEventId: 'evt_b' });

    const first = await processPaymentEvent(store, logger, peId);
    const second = await processPaymentEvent(store, logger, peId);

    expect(first.status).toBe('SUCCESS');
    expect(second).toEqual({ status: 'SKIPPED', reason: 'already_succeeded' });

    const ep = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: peId } });
    expect(ep.attempts).toBe(1); // not re-incremented; claim was refused
    expect(await prisma.idempotencyRecord.count()).toBe(1);
  });

  it('idempotency enforced: a different event with the same providerEventId does not double-write the ledger', async () => {
    const peId1 = await seedEvent({ providerEventId: 'evt_shared' });
    await processPaymentEvent(store, logger, peId1);
    expect(await prisma.idempotencyRecord.count()).toBe(1);

    // A distinct PaymentEvent row, same provider event identity (e.g. reingested).
    const peId2 = await seedEvent({ providerEventId: 'evt_shared' });
    const outcome = await processPaymentEvent(store, logger, peId2);

    // The handler runs and the ledger write hits the unique (provider,eventId)
    // constraint -> treated as already_recorded -> still SUCCESS, but the ledger
    // stays at exactly one entry (the exactly-once backstop).
    expect(outcome.status).toBe('SUCCESS');
    expect(await prisma.idempotencyRecord.count()).toBe(1);
  });

  it('failed state + retry: markFailed persists FAILED/lastError, and the row is re-claimable', async () => {
    const peId = await seedEvent({ providerEventId: 'evt_d' });

    // Claim it (PENDING -> PROCESSING), then mark it failed.
    const claim = await store.claimEvent(peId);
    expect(claim.claimed).toBe(true);
    await store.markFailed(peId, 'simulated handler error');

    const failed = await prisma.eventProcessing.findUniqueOrThrow({
      where: { paymentEventId: peId },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toBe('simulated handler error');

    // FAILED is retryable: a fresh claim succeeds and increments attempts.
    const reclaim = await store.claimEvent(peId);
    expect(reclaim).toMatchObject({ claimed: true });
    const reclaimed = await prisma.eventProcessing.findUniqueOrThrow({
      where: { paymentEventId: peId },
    });
    expect(reclaimed.status).toBe('PROCESSING');
    expect(reclaimed.attempts).toBe(2);
  });
});
