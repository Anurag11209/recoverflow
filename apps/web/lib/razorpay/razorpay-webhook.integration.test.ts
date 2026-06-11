import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { processWebhook } from './service';

const SECRET = 'whsec_test';
const sign = (body: string) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

// Fixed clock so freshness is deterministic regardless of when CI runs.
const NOW = new Date('2026-06-10T12:00:00Z');
const freshTs = Math.floor(NOW.getTime() / 1000) - 10;

const body = (event: string, createdAt: number, id: string) =>
  JSON.stringify({ event, created_at: createdAt, payload: { entity: { id } } });

// PaymentEvent has no FK into WebhookReceipt, but both reference nothing that
// blocks deletion here; clear them independently.
async function clean() {
  await prisma.paymentEvent.deleteMany();
  await prisma.webhookReceipt.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'WH Test Co', email: 'wh@test.local', razorpayWebhookSecret: SECRET },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('processWebhook (integration)', () => {
  it('persists a PaymentEvent and a WebhookReceipt for a valid, fresh event', async () => {
    const raw = body('payment.failed', freshTs, 'pay_1');
    const result = await processWebhook(prisma, {
      merchantId,
      rawBody: raw,
      signature: sign(raw),
      secret: SECRET,
      eventId: 'evt_valid',
      now: NOW,
    });

    expect(result.status).toBe('processed');
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(await prisma.webhookReceipt.count()).toBe(1);

    const pe = await prisma.paymentEvent.findFirstOrThrow();
    expect(pe.provider).toBe('razorpay');
    expect(pe.providerEventId).toBe('evt_valid');
    expect(pe.eventType).toBe('payment.failed');
    expect(pe.signatureVerified).toBe(true);
  });

  it('rejects an invalid signature and writes nothing', async () => {
    const raw = body('payment.failed', freshTs, 'pay_2');
    const result = await processWebhook(prisma, {
      merchantId,
      rawBody: raw,
      signature: 'deadbeef',
      secret: SECRET,
      eventId: 'evt_bad',
      now: NOW,
    });

    expect(result.status).toBe('invalid_signature');
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await prisma.webhookReceipt.count()).toBe(0);
  });

  it('ignores a duplicate delivery: second call is duplicate, only one row persists', async () => {
    const raw = body('subscription.charged', freshTs, 'pay_3');
    const args = {
      merchantId,
      rawBody: raw,
      signature: sign(raw),
      secret: SECRET,
      eventId: 'evt_dup',
      now: NOW,
    };

    const first = await processWebhook(prisma, args);
    const second = await processWebhook(prisma, args);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(await prisma.webhookReceipt.count()).toBe(1);
  });

  it('rejects an expired event (older than the freshness window)', async () => {
    const staleTs = Math.floor(NOW.getTime() / 1000) - 600;
    const raw = body('payment.failed', staleTs, 'pay_4');
    const result = await processWebhook(prisma, {
      merchantId,
      rawBody: raw,
      signature: sign(raw),
      secret: SECRET,
      eventId: 'evt_expired',
      now: NOW,
    });

    expect(result.status).toBe('expired');
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it('classifies an unknown event as UNKNOWN and still persists it', async () => {
    const raw = body('payment.authorized', freshTs, 'pay_5');
    const result = await processWebhook(prisma, {
      merchantId,
      rawBody: raw,
      signature: sign(raw),
      secret: SECRET,
      eventId: 'evt_unknown',
      now: NOW,
    });

    expect(result.status).toBe('processed');
    const pe = await prisma.paymentEvent.findFirstOrThrow();
    expect(pe.eventType).toBe('UNKNOWN');
  });
});
