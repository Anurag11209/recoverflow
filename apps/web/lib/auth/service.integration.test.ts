import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { ConflictError } from '@recoverflow/shared';
import { authenticate, registerMerchant } from './service';

// FK-safe order: sessions -> users -> merchants.
async function clean() {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const input = {
  organizationName: 'Acme Test',
  name: 'Anurag',
  email: 'founder@acme.test',
  password: 'supersecret',
};

describe('registerMerchant (integration)', () => {
  it('creates one merchant and one OWNER user, and opens a session', async () => {
    const result = await registerMerchant(input);
    expect(result.user.role).toBe('OWNER');
    expect(result.user.email).toBe('founder@acme.test');
    expect(result.token).toBeTruthy();

    expect(await prisma.merchant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.session.count()).toBe(1);

    const merchant = await prisma.merchant.findFirstOrThrow();
    expect(merchant.name).toBe('Acme Test');
    expect(merchant.email).toBe('founder@acme.test');
  });

  it('rejects a duplicate email with ConflictError and creates nothing extra', async () => {
    await registerMerchant(input);
    await expect(registerMerchant(input)).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.merchant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe('authenticate (integration)', () => {
  it('returns the user for correct credentials', async () => {
    await registerMerchant(input);
    const user = await authenticate({ email: 'founder@acme.test', password: 'supersecret' });
    expect(user).not.toBeNull();
    expect(user?.email).toBe('founder@acme.test');
  });

  it('returns null for a wrong password', async () => {
    await registerMerchant(input);
    expect(await authenticate({ email: 'founder@acme.test', password: 'nope' })).toBeNull();
  });

  it('returns null for an unknown email (no enumeration signal)', async () => {
    expect(await authenticate({ email: 'ghost@acme.test', password: 'whatever' })).toBeNull();
  });
});
