'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/auth-client';

export function ProfileNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const result = await postJson('/api/settings/profile', { name });
    setPending(false);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(result.error ?? 'Could not save. Please try again.');
    }
  }

  function cancel() {
    setName(initialName);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <dt className="text-sm text-gray-500">Business name</dt>
          <dd className="mt-1 text-sm text-gray-900">{initialName}</dd>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="business-name" className="text-sm text-gray-500">
        Business name
      </label>
      <div className="mt-1 flex items-start gap-2">
        <input
          id="business-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          disabled={pending}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="shrink-0 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
