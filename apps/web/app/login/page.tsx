'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postJson } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await postJson('/api/auth/login', {
      email: form.get('email'),
      password: form.get('password'),
    });
    if (result.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError(result.error ?? 'Unable to sign in.');
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

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

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-gray-500">
        New to RecoverFlow?{' '}
        <Link href="/register" className="font-medium text-gray-900 underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </main>
  );
}
