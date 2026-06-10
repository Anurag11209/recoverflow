import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the *raw* request body with HMAC-SHA256 keyed by the webhook
 * secret, and sends the hex digest in the `X-Razorpay-Signature` header. We
 * recompute the digest over the exact bytes received and compare in constant
 * time. The raw body MUST be the unmodified bytes from the request — any
 * re-serialization (JSON.parse + JSON.stringify) changes the bytes and breaks
 * verification, so the route reads request.text() and never the parsed object.
 */
export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = computeSignature(rawBody, secret);
  // Constant-time compare. timingSafeEqual throws on length mismatch, so guard
  // first; a well-formed signature is fixed-length hex (64 chars).
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
