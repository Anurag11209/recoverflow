import Link from 'next/link';
import { Footer } from '@/components/footer';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6">
        <h1 className="text-3xl font-semibold tracking-tight">RecoverFlow</h1>
        <p className="text-gray-600">
          WhatsApp-first failed-payment recovery for subscription businesses in emerging markets.
        </p>
        <div className="flex gap-3">
          <Link
            href="/register"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
