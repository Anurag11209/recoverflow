import Link from 'next/link';
import { Footer } from './footer';

/**
 * Shared shell for the Terms / Privacy pages. Renders the mandatory
 * "DRAFT — pending legal review" banner, the document title, and the footer.
 * Content is passed as children (styled via descendant utilities).
 */
export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          ← RecoverFlow
        </Link>

        <div
          role="note"
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>DRAFT — pending legal review.</strong> This document is placeholder text, not
          legal advice or a binding agreement. It will be replaced with counsel-reviewed terms
          before launch.
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: {lastUpdated}</p>

        <div className="mt-8 text-sm leading-6 text-gray-700 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
