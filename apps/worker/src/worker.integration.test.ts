import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { createRecoveryStore } from '@recoverflow/adapters';
import type { RecoveryStore } from '@recoverflow/recovery-engine';
import { createWorker } from './worker';
import { createDefaultServices, type WorkerServices } from './deps';
import type { WorkerConfig } from './config';

const BASE_CONFIG: WorkerConfig = {
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

/** Seed a payment.failed PaymentEvent + a PENDING EventProcessing row. */
async function seedPending(providerEventId: string): Promise<string> {
  const merchant = await prisma.merchant.create({
    data: { name: 'Worker Test Co', email: `w-${providerEventId}@test.local` },
  });
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId,
      eventType: 'payment.failed',
      merchantId: merchant.id,
      payload: {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: `pay_${providerEventId}`,
              amount: 49900,
              currency: 'INR',
              email: 'customer@example.com',
              contact: '+919999999999',
              error_description: 'Insufficient funds in account',
            },
          },
        },
      },
      signatureVerified: true,
    },
  });
  await prisma.eventProcessing.create({ data: { paymentEventId: pe.id, status: 'PENDING' } });
  return pe.id;
}

/** A RecoveryStore whose createCase always throws (deterministic handler failure). */
function failingRecovery(message: string): RecoveryStore {
  return {
    ...createRecoveryStore(),
    async createCase(): Promise<never> {
      throw new Error(message);
    },
  };
}

/** A RecoveryStore that delays createCase, widening the claim→mark window. */
function slowRecovery(delayMs: number): RecoveryStore {
  const real = createRecoveryStore();
  return {
    ...real,
    async createCase(input) {
      await new Promise((r) => setTimeout(r, delayMs));
      return real.createCase(input);
    },
  };
}

function makeWorker(config: Partial<WorkerConfig> = {}, overrides: Partial<WorkerServices> = {}) {
  const cfg: WorkerConfig = { ...BASE_CONFIG, ...config };
  const services: WorkerServices = { ...createDefaultServices(cfg), ...overrides };
  return createWorker({ services, config: cfg });
}

describe('worker (integration)', () => {
  it('drains PENDING rows to DONE', async () => {
    const ids = await Promise.all(['d1', 'd2', 'd3'].map(seedPending));
    await makeWorker().drainToCompletion();

    const rows = await prisma.eventProcessing.findMany({ where: { paymentEventId: { in: ids } } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.status).toBe('DONE');
      expect(r.attempts).toBe(1);
      expect(r.completedAt).not.toBeNull();
    }
    expect(await prisma.recoveryCase.count()).toBe(3);
  });

  it('retries a failed row after its backoff, incrementing attempts', async () => {
    const id = await seedPending('f1');
    // Large backoff so the row is NOT immediately eligible again.
    const worker = makeWorker(
      { maxAttempts: 5, backoffBaseMs: 60_000 },
      { recoveryStore: failingRecovery('boom') },
    );

    await worker.drainToCompletion();
    let row = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('boom');
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // Still within backoff → another drain claims nothing.
    await worker.drainToCompletion();
    row = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: id } });
    expect(row.attempts).toBe(1);

    // Simulate the backoff window elapsing → row becomes eligible → attempt #2.
    await prisma.eventProcessing.update({
      where: { paymentEventId: id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await worker.drainToCompletion();
    row = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: id } });
    expect(row.attempts).toBe(2);
    expect(row.status).toBe('FAILED');
  });

  it('dead-letters (DEAD) once max attempts is reached', async () => {
    const id = await seedPending('x1');
    // Zero backoff => immediately re-eligible, so one drain runs both attempts.
    const worker = makeWorker(
      { maxAttempts: 2, backoffBaseMs: 0 },
      { recoveryStore: failingRecovery('always fails') },
    );

    await worker.drainToCompletion();

    const row = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: id } });
    expect(row.status).toBe('DEAD');
    expect(row.attempts).toBe(2);
    expect(row.completedAt).not.toBeNull();
    expect(row.lastError).toContain('always fails');

    // Terminal: not eligible anymore.
    await worker.drainToCompletion();
    const after = await prisma.eventProcessing.findUniqueOrThrow({ where: { paymentEventId: id } });
    expect(after.attempts).toBe(2);
    expect(after.status).toBe('DEAD');
  });

  it('two concurrent workers never double-process a row', async () => {
    const ids = await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5'].map(seedPending));
    // Two independent workers sharing the same database; slow createCase widens
    // the claim→mark window so both are genuinely racing for the same rows.
    const w1 = makeWorker({}, { recoveryStore: slowRecovery(20) });
    const w2 = makeWorker({}, { recoveryStore: slowRecovery(20) });

    await Promise.all([w1.drainToCompletion(), w2.drainToCompletion()]);

    const rows = await prisma.eventProcessing.findMany({ where: { paymentEventId: { in: ids } } });
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.status).toBe('DONE');
      // Claimed exactly once (the atomic claim increments attempts once).
      expect(r.attempts).toBe(1);
    }
    // Exactly one RecoveryCase per event — no duplicate side effects.
    expect(await prisma.recoveryCase.count()).toBe(5);
  });
});
