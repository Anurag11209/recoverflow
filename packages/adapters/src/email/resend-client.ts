import type { EmailClient, EmailMessage } from './email-types';

/** Resend's transactional send endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendClientConfig {
  /** Resend API key (`re_...`). */
  apiKey: string;
  /** Verified From identity, e.g. "RecoverFlow <no-reply@recoverflow.com>". */
  from: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests; defaults to Resend's production endpoint. */
  endpoint?: string;
}

/**
 * Real Resend-backed EmailClient. Hand-rolled over fetch (no SDK) to match the
 * repo's minimal-dependency, easy-to-mock style. Any non-2xx response or
 * transport error THROWS with detail — there is no path that resolves without a
 * confirmed send, so a caller that awaits successfully knows the email was
 * accepted by Resend (and can record the returned id).
 */
export function createResendEmailClient(config: ResendClientConfig): EmailClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint ?? RESEND_ENDPOINT;

  return {
    async sendEmail(message: EmailMessage): Promise<{ id: string }> {
      let res: Response;
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: config.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            ...(message.text ? { text: message.text } : {}),
          }),
        });
      } catch (err) {
        // Transport failure (DNS/TLS/timeout). Fail loudly.
        throw new Error(
          `Resend request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend API error ${res.status}: ${body.slice(0, 500)}`);
      }

      const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (!data || typeof data.id !== 'string' || data.id.length === 0) {
        throw new Error('Resend API returned a 2xx with no message id');
      }
      return { id: data.id };
    },
  };
}
