export interface PostResult {
  ok: boolean;
  error?: string;
}

/**
 * POSTs JSON to a same-origin endpoint and normalizes our error envelope
 * ({ error: { code, message } }) into a flat result the forms can render.
 * Same-origin requests carry an Origin header, satisfying the CSRF guard.
 */
export async function postJson(url: string, body: unknown): Promise<PostResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: data?.error?.message ?? 'Something went wrong. Please try again.' };
  } catch {
    return { ok: false, error: 'Network error. Please check your connection and try again.' };
  }
}
