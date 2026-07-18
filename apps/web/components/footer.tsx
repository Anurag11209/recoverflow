import Link from 'next/link';

/**
 * Site footer for public/marketing pages. Carries the legal links (Terms,
 * Privacy) required from the footer.
 */
export function Footer() {
  return (
    <footer className="border-t border-gray-200">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-8 text-sm text-gray-500 sm:flex-row sm:justify-between">
        <p>© RecoverFlow</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="underline underline-offset-4 hover:text-gray-900">
            Terms of Service
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-gray-900">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
