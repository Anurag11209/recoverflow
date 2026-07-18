import type { Metadata } from 'next';
import { LegalShell } from '@/components/legal-shell';

export const metadata: Metadata = {
  title: 'Terms of Service — RecoverFlow',
  description: 'RecoverFlow Terms of Service (draft, pending legal review).',
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated="—">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of RecoverFlow
        (the &ldquo;Service&rdquo;). This is placeholder copy intended to reserve the page and
        outline the sections a final agreement will contain. It has not been reviewed by legal
        counsel and creates no obligations.
      </p>

      <h2>1. Acceptance of terms</h2>
      <p>
        By creating an account or using the Service, you agree to be bound by these Terms on behalf
        of yourself and any organization you represent. If you do not agree, do not use the Service.
      </p>

      <h2>2. The service</h2>
      <p>
        RecoverFlow helps subscription businesses recover failed payments by detecting failed
        charges and messaging affected customers. Availability, features, and limits may change over
        time.
      </p>

      <h2>3. Accounts and security</h2>
      <ul>
        <li>You are responsible for the credentials and API keys you configure.</li>
        <li>You must keep your webhook secret confidential.</li>
        <li>You are responsible for activity that occurs under your account.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>
        You agree not to misuse the Service, including by sending unlawful or unsolicited messages,
        infringing others&rsquo; rights, or attempting to disrupt the Service.
      </p>

      <h2>5. Fees</h2>
      <p>
        Paid plans, billing intervals, and refunds will be described here and on the billing page.
        Placeholder pending final commercial terms.
      </p>

      <h2>6. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any kind. Placeholder
        pending counsel-reviewed disclaimer and liability caps.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these Terms. Material changes will be communicated through the Service or by
        email.
      </p>

      <h2>8. Contact</h2>
      <p>Questions about these Terms can be directed to the RecoverFlow team.</p>
    </LegalShell>
  );
}
