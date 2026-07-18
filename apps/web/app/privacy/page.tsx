import type { Metadata } from 'next';
import { LegalShell } from '@/components/legal-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy — RecoverFlow',
  description: 'RecoverFlow Privacy Policy (draft, pending legal review).',
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated="—">
      <p>
        This Privacy Policy describes how RecoverFlow (the &ldquo;Service&rdquo;) collects, uses,
        and shares information. This is placeholder copy intended to reserve the page and outline
        the sections a final policy will contain. It has not been reviewed by legal counsel.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your name, business name, and email address.
        </li>
        <li>
          <strong>Payment-event data</strong> — failed-payment details received from your payment
          processor via webhooks (e.g. amount, currency, customer contact) used to power recovery.
        </li>
        <li>
          <strong>Usage data</strong> — logs and metrics needed to operate and secure the Service.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>
        To provide the recovery workflow, send recovery messages on your behalf, secure the Service,
        and comply with legal obligations.
      </p>

      <h2>3. Sharing</h2>
      <p>
        We share data with subprocessors that help us run the Service (e.g. hosting, database, email
        and messaging providers). A final list of subprocessors will be published here.
      </p>

      <h2>4. Data retention</h2>
      <p>
        We retain data for as long as your account is active or as needed to provide the Service,
        then delete or anonymize it. Specific retention periods are placeholder pending review.
      </p>

      <h2>5. Security</h2>
      <p>
        We use industry-standard measures, including encryption of sensitive secrets at rest and
        signature verification of inbound webhooks. No method of transmission or storage is fully
        secure.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, correct, or delete your
        personal data. Placeholder pending counsel-reviewed rights and request process.
      </p>

      <h2>7. Contact</h2>
      <p>Questions about this policy can be directed to the RecoverFlow team.</p>
    </LegalShell>
  );
}
