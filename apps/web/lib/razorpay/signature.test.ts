import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeSignature, verifySignature } from './signature';

const SECRET = 'whsec_test_123';
const BODY = '{"event":"payment.failed","created_at":1718000000}';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('computeSignature', () => {
  it('produces the HMAC-SHA256 hex digest of the raw body', () => {
    expect(computeSignature(BODY, SECRET)).toBe(sign(BODY, SECRET));
  });
});

describe('verifySignature', () => {
  it('accepts a correct signature', () => {
    expect(verifySignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'wrong_secret'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(BODY, SECRET);
    expect(verifySignature(BODY + ' ', sig, SECRET)).toBe(false);
  });

  it('rejects a missing/empty signature', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifySignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects a malformed signature without throwing (length mismatch)', () => {
    expect(verifySignature(BODY, 'abc123', SECRET)).toBe(false);
  });
});
