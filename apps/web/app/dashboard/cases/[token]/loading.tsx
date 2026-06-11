export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-40 animate-pulse rounded bg-gray-100" />
      <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
      <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
    </div>
  );
}
