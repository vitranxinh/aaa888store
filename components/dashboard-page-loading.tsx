type DashboardPageLoadingProps = {
  titleWidth?: string;
  descriptionWidth?: string;
  showFilterBar?: boolean;
  showActionButton?: boolean;
  cardCount?: number;
  cardMinHeight?: string;
};

export function DashboardPageLoading({
  titleWidth = "w-44 sm:w-56 lg:w-72",
  descriptionWidth = "w-72 lg:w-[32rem]",
  showFilterBar = true,
  showActionButton = true,
  cardCount = 4,
  cardMinHeight = "min-h-[144px]"
}: DashboardPageLoadingProps) {
  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="mb-6 flex min-h-[120px] flex-col justify-between gap-4 md:min-h-[112px] md:flex-row md:items-start lg:min-h-[132px]">
        <div className="min-h-[84px] flex-1 sm:min-h-[96px] lg:min-h-[112px]">
          <div className={`h-10 animate-pulse rounded bg-slate-100 sm:h-12 lg:h-[60px] ${titleWidth}`} />
          <div className={`mt-2 h-6 max-w-full animate-pulse rounded bg-slate-100 lg:h-8 ${descriptionWidth}`} />
        </div>
      </header>

      {showFilterBar || showActionButton ? (
        <div className="flex min-h-[56px] flex-col gap-3 lg:min-h-[64px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          {showFilterBar ? <div className="h-14 w-full max-w-xl animate-pulse rounded-2xl bg-white shadow-soft" /> : <div />}
          {showActionButton ? <div className="h-12 w-32 animate-pulse rounded-2xl bg-emerald-100 shadow-soft" /> : null}
        </div>
      ) : null}

      <div className="grid min-h-[620px] gap-3">
        {Array.from({ length: cardCount }).map((_, index) => (
          <div key={index} className={`${cardMinHeight} rounded-3xl border border-slate-200 bg-white p-4 shadow-soft`}>
            <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-6 w-56 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
