function OrderListSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-4 w-20 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
          <div className="mt-4 h-6 w-48 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-10 animate-pulse rounded-2xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export default function OrdersLoading() {
  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="h-10 w-48 animate-pulse rounded bg-slate-100 sm:h-12 sm:w-60" />
          <div className="mt-2 h-5 w-64 animate-pulse rounded bg-slate-100" />
        </div>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="h-14 w-full animate-pulse rounded-2xl bg-white shadow-soft" />
        <div className="h-12 w-32 animate-pulse rounded-2xl bg-emerald-100 shadow-soft" />
      </div>

      <OrderListSkeleton />
    </div>
  );
}
