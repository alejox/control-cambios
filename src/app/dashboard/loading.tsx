export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10"
    >
      <span className="sr-only">Cargando contenido…</span>

      <div aria-hidden className="animate-pulse">
        <div className="mb-8 space-y-3">
          <div className="h-3 w-28 rounded-full bg-border" />
          <div className="h-8 w-52 rounded-lg bg-border" />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-36 rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="h-12 border-b border-border bg-surface-alt/60" />
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex gap-4 border-b border-border p-5 last:border-0">
              <div className="h-4 w-12 rounded bg-border" />
              <div className="h-4 flex-1 rounded bg-border" />
              <div className="h-4 w-24 rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
