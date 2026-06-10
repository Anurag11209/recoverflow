import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { processWebhook, type WebhookStore } from './service';

const SECRET = 'whsec_test';
const sign = (b: string) => createHmac('sha256', SECRET).update(b, 'utf8').digest('hex');
const bodyAt = (event: string, createdAt: number) =>
  JSON.stringify({ event, created_at: createdAt, payload: { x: 1 } });

// Fake Prisma: enforces the unique (provider,eventId) like the real DB, and
// rolls back its in-memory state if the transaction callback throws.
function makeStore() {
  const receipts = new Set<string>();
  const paymentEvents: Array<Record<string, unknown>> = [];
  let seq = 0;
  const store: WebhookStore = {
    async $transaction(fn) {
      const snapshot = new Set(receipts);
      const before = paymentEvents.length;
      try {
        return await fn({
          webhookReceipt: {
            async create({ data }) {
              const key = `${data.provider}:${data.eventId}`;
              if (receipts.has(key)) throw { code: 'P2002' };
              receipts.add(key);
              return data;
            },
          },
          paymentEvent: {
            async create({ data }) {
              const id = `pe_${++seq}`;
              paymentEvents.push({ id, ...data });
              return { id };
            },
          },
        });
      } catch (e) {
        receipts.clear();
        for (const k of snapshot) receipts.add(k);
        paymentEvents.length = before;
        throw e;
      }
    },
  };
  return { store, paymentEvents };
}

const NOW = new Date('2026-06-10T12:00:00Z');
const FRESH = Math.floor(NOW.getTime() / 1000) - 10;

describe('processWebhook', () => {
  it('processes a valid, fresh, known event and persists one PaymentEvent', async () => {
    const { store, paymentEvents } = makeStore();
    const body = bodyAt('payment.failed', FRESH);
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_1',
      now: NOW,
    });
    expect(r.status).toBe('processed');
    if (r.status === 'processed') expect(r.eventType).toBe('payment.failed');
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0].signatureVerified).toBe(true);
  });

  it('classifies an unrecognized event as UNKNOWN but still persists', async () => {
    const { store, paymentEvents } = makeStore();
    const body = bodyAt('payment.authorized', FRESH);
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_u',
      now: NOW,
    });
    expect(r.status).toBe('processed');
    if (r.status === 'processed') expect(r.eventType).toBe('UNKNOWN');
    expect(paymentEvents).toHaveLength(1);
  });

  it('rejects an invalid signature and writes nothing', async () => {
    const { store, paymentEvents } = makeStore();
    const body = bodyAt('payment.failed', FRESH);
    const r = await processWebhook(store, {
      rawBody: body,
      signature: 'deadbeef',
      secret: SECRET,
      eventId: 'evt_2',
      now: NOW,
    });
    expect(r.status).toBe('invalid_signature');
    expect(paymentEvents).toHaveLength(0);
  });

  it('rejects an expired event (older than threshold)', async () => {
    const { store, paymentEvents } = makeStore();
    const stale = Math.floor(NOW.getTime() / 1000) - 600;
    const body = bodyAt('payment.failed', stale);
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_3',
      now: NOW,
    });
    expect(r.status).toBe('expired');
    expect(paymentEvents).toHaveLength(0);
  });

  it('treats a missing created_at as expired (fail safe)', async () => {
    const { store } = makeStore();
    const body = JSON.stringify({ event: 'payment.failed', payload: {} });
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_4',
      now: NOW,
    });
    expect(r.status).toBe('expired');
  });

  it('rejects malformed JSON even when the signature matches', async () => {
    const { store } = makeStore();
    const body = 'not-json{';
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_5',
      now: NOW,
    });
    expect(r.status).toBe('invalid_payload');
  });

  it('dedupes a replayed event: second delivery is duplicate, no second row', async () => {
    const { store, paymentEvents } = makeStore();
    const body = bodyAt('subscription.charged', FRESH);
    const args = {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      eventId: 'evt_dup',
      now: NOW,
    };
    const first = await processWebhook(store, args);
    const second = await processWebhook(store, args);
    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(paymentEvents).toHaveLength(1);
  });

  it('falls back to sha256(body) as event id when no header id is given', async () => {
    const { store, paymentEvents } = makeStore();
    const body = bodyAt('payment.captured', FRESH);
    const r = await processWebhook(store, {
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
      now: NOW,
    });
    expect(r.status).toBe('processed');
    expect(paymentEvents[0].providerEventId).toHaveLength(64); // hex sha256
  });
});
