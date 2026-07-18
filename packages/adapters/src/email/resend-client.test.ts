import { describe, expect, it, vi } from 'vitest';
import { createResendEmailClient } from './resend-client';

const MSG = { to: 'customer@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createResendEmailClient', () => {
  it('POSTs to Resend and returns the message id on success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'resend_abc123' }));
    const client = createResendEmailClient({
      apiKey: 're_test_key',
      from: 'RecoverFlow <no-reply@recoverflow.com>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await client.sendEmail(MSG);

    expect(res).toEqual({ id: 'resend_abc123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.to).toBe('customer@example.com');
    expect(sent.from).toContain('no-reply@recoverflow.com');
    expect(sent.subject).toBe('Hi');
  });

  it('throws (fails loudly) on a non-2xx API error — no fake success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'invalid from' }, 422));
    const client = createResendEmailClient({
      apiKey: 're_test_key',
      from: 'bad',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.sendEmail(MSG)).rejects.toThrow(/Resend API error 422/);
  });

  it('throws on a transport/network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const client = createResendEmailClient({
      apiKey: 're_test_key',
      from: 'f',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.sendEmail(MSG)).rejects.toThrow(/Resend request failed/);
  });

  it('throws when a 2xx response carries no message id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const client = createResendEmailClient({
      apiKey: 're_test_key',
      from: 'f',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.sendEmail(MSG)).rejects.toThrow(/no message id/);
  });
});
