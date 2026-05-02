function OrderListSkeleton() {
  return (
    <div className="grid min-h-[620px] gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-h-[144px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
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
      <header className="mb-6 flex min-h-[120px] flex-col justify-between gap-4 md:min-h-[112px] md:flex-row md:items-start lg:min-h-[132px]">
        <div className="min-h-[84px] flex-1 sm:min-h-[96px] lg:min-h-[112px]">
          <div className="h-10 w-44 animate-pulse rounded bg-slate-100 sm:h-12 sm:w-56 lg:h-[60px] lg:w-72" />
          <div className="mt-2 h-6 w-72 max-w-full animate-pulse rounded bg-slate-100 lg:h-8 lg:w-[32rem]" />
        </div>
      </header>

      <div className="flex min-h-[56px] flex-col gap-3 lg:min-h-[64px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="h-14 w-full animate-pulse rounded-2xl bg-white shadow-soft" />
        <div className="h-12 w-32 animate-pulse rounded-2xl bg-emerald-100 shadow-soft" />
      </div>

      <OrderListSkeleton />
    </div>
  );
}
