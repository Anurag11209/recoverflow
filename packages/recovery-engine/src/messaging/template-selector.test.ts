import { describe, expect, it } from 'vitest';
import { selectTemplate } from './template-selector';
import { FAILURE_CATEGORIES } from '../recovery/classifier';
import { MESSAGE_TEMPLATES } from './message-types';

describe('selectTemplate', () => {
  it('EXPIRED_CARD -> CARD_EXPIRED', () => {
    expect(selectTemplate('EXPIRED_CARD')).toBe('CARD_EXPIRED');
  });
  it('INSUFFICIENT_FUNDS -> PAYMENT_FAILED', () => {
    expect(selectTemplate('INSUFFICIENT_FUNDS')).toBe('PAYMENT_FAILED');
  });
  it('BANK_DECLINED -> PAYMENT_FAILED', () => {
    expect(selectTemplate('BANK_DECLINED')).toBe('PAYMENT_FAILED');
  });
  it('NETWORK_ERROR -> PAYMENT_FAILED', () => {
    expect(selectTemplate('NETWORK_ERROR')).toBe('PAYMENT_FAILED');
  });
  it('UNKNOWN -> PAYMENT_FAILED', () => {
    expect(selectTemplate('UNKNOWN')).toBe('PAYMENT_FAILED');
  });
  it('every category maps to a known template', () => {
    for (const c of FAILURE_CATEGORIES) {
      expect(MESSAGE_TEMPLATES).toContain(selectTemplate(c));
    }
  });
});
