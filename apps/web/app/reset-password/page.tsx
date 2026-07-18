'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { postJson } from '@/lib/auth-client';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    const result = await postJson('/api/auth/reset-password', { token, password });
    if (result.ok) {
      setDone(true);
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 1200);
    } else {
      setError(result.error ?? 'Unable to reset your password.');
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          This reset link is missing its token. Request a new one.
        </p>
        <p className="text-sm text-gray-500">
          <Link
            href="/forgot-password"
            className="font-medium text-gray-900 underline underline-offset-4"
          >
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
        Your password has been reset. Redirecting you to sign in…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-500">At least 8 characters.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      </div>
      {/* useSearchParams must be under a Suspense boundary in the App Router. */}
      <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
