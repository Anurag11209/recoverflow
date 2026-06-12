import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { recordAuditEvent, recentAuditEvents } from './audit';
import { updateProfileName, regenerateWebhookSecret } from './service';
import { decryptSecret } from '../crypto/secret-cipher';

async function clean() {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
let userId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Audit Co', email: 'audit@test.local', razorpayWebhookSecret: 'whsec_seed' },
  });
  merchantId = m.id;
  const u = await prisma.user.create({
    data: { merchantId, email: 'audit@test.local', passwordHash: 'x', name: 'A', role: 'OWNER' },
  });
  userId = u.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('audit service (integration)', () => {
  it('records an entry and returns it newest-first', async () => {
    await recordAuditEvent({
      merchantId,
      userId,
      action: 'profile.updated',
      metadata: { field: 'name', from: 'a', to: 'b' },
    });
    const events = await recentAuditEvents(merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('profile.updated');
    expect(events[0].userId).toBe(userId);
  });

  it('orders multiple entries newest-first', async () => {
    await recordAuditEvent({ merchantId, action: 'profile.updated' });
    await recordAuditEvent({ merchantId, action: 'webhook_secret.regenerated' });
    const events = await recentAuditEvents(merchantId);
    expect(events.map((e) => e.action)).toEqual(['webhook_secret.regenerated', 'profile.updated']);
  });
});

describe('updateProfileName (integration)', () => {
  it('updates the name and writes a profile.updated audit entry', async () => {
    const result = await updateProfileName(merchantId, '  New Name  ', userId);
    expect(result.name).toBe('New Name'); // trimmed

    const m = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    expect(m.name).toBe('New Name');

    const events = await recentAuditEvents(merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('profile.updated');
    expect(events[0].metadata).toMatchObject({ field: 'name', from: 'Audit Co', to: 'New Name' });
  });

  it('rejects an empty name and writes no audit entry', async () => {
    await expect(updateProfileName(merchantId, '   ', userId)).rejects.toThrow();
    expect(await recentAuditEvents(merchantId)).toHaveLength(0);
  });

  it('rejects an over-long name', async () => {
    await expect(updateProfileName(merchantId, 'x'.repeat(121), userId)).rejects.toThrow();
  });

  it('does not audit a no-op (same name)', async () => {
    await updateProfileName(merchantId, 'Audit Co', userId);
    expect(await recentAuditEvents(merchantId)).toHaveLength(0);
  });
});

describe('regeneration audit (integration)', () => {
  it('writes a webhook_secret.regenerated entry that contains NO secret value', async () => {
    const newSecret = await regenerateWebhookSecret(merchantId, userId);
    const events = await recentAuditEvents(merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('webhook_secret.regenerated');

    // The audit row must not leak the secret in any form.
    const stored = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const plaintext = decryptSecret(stored.razorpayWebhookSecret);
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain(newSecret);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).not.toContain(stored.razorpayWebhookSecret);
  });
});
