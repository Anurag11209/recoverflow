/**
 * The low-level "email capability" (ADR 0001 style port). A channel-neutral
 * primitive — send one email — that both the recovery-message email provider
 * and the password-reset flow build on. Concrete implementations: a real Resend
 * HTTP client (prod) and a console logger (local dev / CI).
 */
export interface EmailMessage {
  /** Recipient address. */
  to: string;
  subject: string;
  /** HTML body (required). */
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
}

export interface EmailClient {
  /** Send one email. MUST reject (throw) on any delivery failure — never resolve
   * on a non-success so callers can treat a resolved promise as a real send. */
  sendEmail(message: EmailMessage): Promise<{ id: string }>;
}
