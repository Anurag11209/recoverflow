import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { decryptSecret, isEncrypted } from '../crypto/secret-cipher';
import { regenerateWebhookSecret, generateWebhookSecret } from './service';

async function clean() {
  await prisma.merchant.deleteMany();
}

let merchantId: string;
const ORIGINAL = 'whsec_original_plaintext';
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Regen Co', email: 'regen@test.local', razorpayWebhookSecret: ORIGINAL },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const sign = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('regenerateWebhookSecret (integration)', () => {
  it('generateWebhookSecret produces the whsec_ shape', () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^whsec_[0-9a-f]{48}$/);
  });

  it('replaces the stored secret and returns a new plaintext value', async () => {
    const returned = await regenerateWebhookSecret(merchantId);
    expect(returned).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(returned).not.toBe(ORIGINAL);
  });

  it('stores the new secret encrypted at rest', async () => {
    await regenerateWebhookSecret(merchantId);
    const m = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    expect(isEncrypted(m.razorpayWebhookSecret)).toBe(true);
    // And it decrypts back to a valid whsec_ secret.
    expect(decryptSecret(m.razorpayWebhookSecret)).toMatch(/^whsec_[0-9a-f]{48}$/);
  });

  it('the new secret verifies an HMAC the old secret no longer does', async () => {
    const newSecret = await regenerateWebhookSecret(merchantId);
    const body = '{"event":"payment.failed"}';

    // A signature made with the NEW secret verifies against the stored (decrypted) secret.
    const m = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const stored = decryptSecret(m.razorpayWebhookSecret);
    expect(sign(newSecret, body)).toBe(sign(stored, body));

    // A signature made with the ORIGINAL secret no longer matches.
    expect(sign(ORIGINAL, body)).not.toBe(sign(stored, body));
  });

  it('two regenerations produce distinct secrets', async () => {
    const first = await regenerateWebhookSecret(merchantId);
    const second = await regenerateWebhookSecret(merchantId);
    expect(second).not.toBe(first);
  });
});
