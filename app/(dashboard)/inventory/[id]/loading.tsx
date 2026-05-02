export default function InventoryDetailLoading() {
  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="min-h-[132px]">
        <div className="h-12 w-64 animate-pulse rounded bg-slate-100 sm:h-14" />
        <div className="mt-3 h-6 w-80 animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
          <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="min-h-[150px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-6 w-56 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-20 animate-pulse rounded-2xl bg-slate-50" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="min-h-[240px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
              <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="h-16 animate-pulse rounded-2xl bg-slate-50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
