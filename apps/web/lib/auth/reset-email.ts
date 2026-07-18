/**
 * Build the password-reset email body. Kept separate from the send mechanism so
 * the copy is unit-checkable and the routes stay thin. The reset URL is our own
 * APP_BASE_URL link, but it is still HTML-escaped defensively.
 */
export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildResetEmail(resetUrl: string): BuiltEmail {
  const subject = 'Reset your RecoverFlow password';
  const safe = esc(resetUrl);

  const html = `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;font-weight:600;letter-spacing:-.01em;color:#6b7280;margin:0 0 16px">RecoverFlow</p>
    <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
    <p style="font-size:15px;line-height:1.5;margin:0">We received a request to reset your RecoverFlow password. Click the button below to choose a new one. This link expires in 30 minutes and can be used once.</p>
    <p style="margin:24px 0"><a href="${safe}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">Reset password</a></p>
    <p style="color:#6b7280;font-size:13px">Or paste this link into your browser:<br>${safe}</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">If you didn’t request this, you can safely ignore this email — your password won’t change.</p>
  </div>
</body></html>`;

  const text = `Reset your RecoverFlow password\n\nWe received a request to reset your password. Open the link below to choose a new one. It expires in 30 minutes and can be used once.\n\n${resetUrl}\n\nIf you didn’t request this, you can ignore this email.`;

  return { subject, html, text };
}
