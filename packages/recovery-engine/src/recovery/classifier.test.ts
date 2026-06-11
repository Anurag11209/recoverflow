import { describe, expect, it } from 'vitest';
import { classifyFailure, FAILURE_CATEGORIES } from './classifier';

function payload(entity: Record<string, unknown>) {
  return { event: 'payment.failed', payload: { payment: { entity } } };
}

describe('classifyFailure category', () => {
  it('EXPIRED_CARD', () => {
    expect(classifyFailure(payload({ error_description: 'Your card has expired' })).category).toBe(
      'EXPIRED_CARD',
    );
  });
  it('INSUFFICIENT_FUNDS', () => {
    expect(
      classifyFailure(payload({ error_description: 'Insufficient funds in account' })).category,
    ).toBe('INSUFFICIENT_FUNDS');
  });
  it('BANK_DECLINED', () => {
    expect(
      classifyFailure(payload({ error_description: 'Payment declined by issuer' })).category,
    ).toBe('BANK_DECLINED');
  });
  it('NETWORK_ERROR', () => {
    expect(
      classifyFailure(payload({ error_description: 'Gateway timeout, please try again' })).category,
    ).toBe('NETWORK_ERROR');
  });
  it('UNKNOWN when nothing matches', () => {
    expect(classifyFailure(payload({ error_description: 'something inexplicable' })).category).toBe(
      'UNKNOWN',
    );
  });
  it('UNKNOWN when no error fields at all', () => {
    expect(classifyFailure(payload({})).category).toBe('UNKNOWN');
  });
  it('matches on error_code too, not just description', () => {
    expect(classifyFailure(payload({ error_code: 'BAD_REQUEST_CARD_EXPIRED' })).category).toBe(
      'EXPIRED_CARD',
    );
  });
  it('first matching rule wins (expired before declined)', () => {
    expect(classifyFailure(payload({ error_description: 'card expired, declined' })).category).toBe(
      'EXPIRED_CARD',
    );
  });
});

describe('classifyFailure extraction', () => {
  it('pulls provider payment id, email, phone, currency, raw reason', () => {
    const c = classifyFailure(
      payload({
        id: 'pay_123',
        email: 'a@b.com',
        contact: '+919876543210',
        amount: 49900,
        currency: 'INR',
        error_description: 'Insufficient funds',
      }),
    );
    expect(c.providerPaymentId).toBe('pay_123');
    expect(c.customerEmail).toBe('a@b.com');
    expect(c.customerPhone).toBe('+919876543210');
    expect(c.currency).toBe('INR');
    expect(c.failureReason).toBe('Insufficient funds');
  });
  it('converts paise to major units', () => {
    expect(classifyFailure(payload({ amount: 49900 })).amount).toBe(499);
  });
  it('null amount when absent', () => {
    expect(classifyFailure(payload({})).amount).toBeNull();
  });
  it('every category is a known constant', () => {
    const c = classifyFailure(payload({ error_description: 'expired' }));
    expect(FAILURE_CATEGORIES).toContain(c.category);
  });
});
