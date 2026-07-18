'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postJson } from '@/lib/auth-client';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await postJson('/api/auth/register', {
      organizationName: form.get('organizationName'),
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    });
    if (result.ok) {
      // New merchants land on the guided onboarding page to connect Razorpay.
      router.push('/onboarding');
      router.refresh();
    } else {
      setError(result.error ?? 'Unable to create your account.');
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
            Business name
          </label>
          <input
            id="organizationName"
            name="organizationName"
            type="text"
            required
            autoComplete="organization"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Work email
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
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-500">At least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-gray-500">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-gray-700">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-gray-700">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-gray-900 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
