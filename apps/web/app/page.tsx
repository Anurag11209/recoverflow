export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">RecoverFlow</h1>
      <p className="text-gray-600">
        WhatsApp-first failed-payment recovery for subscription businesses in emerging markets.
      </p>
      <p className="text-sm text-gray-500">
        Phase 1 scaffold — health at{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">/api/health</code>, readiness at{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">/api/ready</code>.
      </p>
    </main>
  );
}
