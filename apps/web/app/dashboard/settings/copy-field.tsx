'use client';

import { useState } from 'react';

/**
 * Read-only value with a copy button, and optional mask/reveal for secrets.
 * The page (a server component) decrypts and passes the plain value in; this
 * island only handles clipboard + show/hide UX.
 */
export function CopyField({
  value,
  label,
  secret = false,
  monospace = true,
}: {
  value: string;
  label: string;
  secret?: boolean;
  monospace?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); fail quietly.
    }
  }

  const shown = revealed ? value : '•'.repeat(Math.min(value.length, 24));

  return (
    <div>
      <label className="text-sm text-gray-500">{label}</label>
      <div className="mt-1 flex items-stretch gap-2">
        <span
          className={`min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 ${
            monospace ? 'font-mono' : ''
          }`}
          title={revealed ? value : undefined}
        >
          {shown}
        </span>
        {secret ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="shrink-0 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
