'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { postJson } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    // Enumeration-safe UX: we always advance to the same confirmation, regardless
    // of the response (the endpoint returns an identical 200 either way).
    await postJson('/api/auth/request-password-reset', { email: form.get('email') });
    setPending(false);
    setSubmitted(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            If an account exists for that email, we’ve sent a link to reset your password. It expires
            in 30 minutes.
          </p>
          <p className="text-sm text-gray-500">
            <Link href="/login" className="font-medium text-gray-900 underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Enter your account email and we’ll send you a link to choose a new password.
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="text-sm text-gray-500">
            Remembered it?{' '}
            <Link href="/login" className="font-medium text-gray-900 underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
