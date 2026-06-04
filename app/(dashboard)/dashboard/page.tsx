import { PrefetchNavLink } from "@/components/prefetch-nav-link";
import { AppHeader } from "@/components/app-header";
import { ChartCard } from "@/components/chart-card";
import { requireSession } from "@/lib/auth";
import { getDashboardData, type DashboardRange } from "@/lib/data";
import { canAccess } from "@/lib/permissions";
import { formatCurrency } from "@/lib/utils";

const ranges: { label: string; value: DashboardRange }[] = [
  { label: "Hôm nay", value: "today" },
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "Tháng này", value: "month" }
];

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: { range?: DashboardRange };
}) {
  const session = await requireSession();
  const range = searchParams?.range ?? "today";
  const data = await getDashboardData(session.branchId ?? undefined, range);
  const selectedRangeLabel = ranges.find((item) => item.value === range)?.label ?? "Hôm nay";

  const cards = [
    { label: "Khách hàng", value: data.customerCount, icon: "👥", tone: "border-slate-200 bg-white" },
    { label: "Đầu mục SP", value: data.productCount, icon: "📦", tone: "border-slate-200 bg-white" },
    { label: "Hóa đơn", value: data.invoiceCount, icon: "🧾", tone: "border-slate-200 bg-white" },
    { label: "Doanh thu", value: formatCurrency(data.revenue), icon: "💰", tone: "border-emerald-200 bg-emerald-50/60" },
    {
      label: "Công nợ",
      value: formatCurrency(data.debt),
      icon: "📋",
      tone: "border-red-200 bg-red-50/60",
      labelClassName: "text-red-600",
      valueClassName: "text-red-600"
    },
    { label: "Hết hàng", value: data.outStockCount, icon: "⛔", tone: "border-red-200 bg-red-50/60", labelClassName: "text-red-600", valueClassName: "text-red-600" },
    { label: "Sắp hết hàng", value: data.lowStockCount, icon: "⚠️", tone: "border-orange-200 bg-orange-50/60" }
  ];

  const mobileQuickLinks = [
    { href: "/cashflow", label: "Thu / Chi", icon: "💸", tone: "bg-amber-50 text-amber-700 border-amber-100" },
    { href: "/inventory", label: "Nhập hàng", icon: "📥", tone: "bg-violet-50 text-violet-700 border-violet-100" }
  ].filter((item) => (item.href === "/inventory" ? canAccess(session.role, "inventory") : true));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Tổng quan" description="Tổng hợp hoạt động bán hàng và công nợ" session={session} />

      <form className="flex flex-col items-stretch gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 sm:min-w-[240px]">
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-500">Khung thời gian doanh thu</label>
          <select
            name="range"
            defaultValue={range}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none"
          >
            {ranges.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <button className="h-12 rounded-2xl bg-emerald-600 px-5 text-base font-semibold text-white">Áp dụng</button>
        <p className="pb-0 text-sm text-slate-500 sm:pb-2">Đang xem theo: <span className="font-semibold text-slate-700">{selectedRangeLabel}</span></p>
      </form>

      <section className="grid grid-cols-3 gap-3 sm:hidden">
        {mobileQuickLinks.map((item) => (
          <PrefetchNavLink
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`rounded-3xl border p-4 shadow-soft ${item.tone}`}
          >
            <div className="text-2xl">{item.icon}</div>
            <p className="mt-3 text-sm font-bold leading-snug">{item.label}</p>
          </PrefetchNavLink>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-5 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={`min-w-0 overflow-hidden rounded-3xl border p-5 shadow-soft sm:p-7 ${card.tone}`}>
            <div className="flex items-start justify-between">
              <p className={`text-xl font-semibold sm:text-[22px] ${card.labelClassName ?? "text-slate-500"}`}>{card.label}</p>
              <span className="text-3xl sm:text-3xl">{card.icon}</span>
            </div>
            <p className={`mt-5 min-w-0 text-[1.55rem] font-bold leading-none tracking-tight whitespace-nowrap sm:mt-7 sm:text-5xl ${card.valueClassName ?? "text-slate-900"}`}>{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:gap-6">
        <ChartCard title="Doanh thu theo thời gian" description="Doanh thu theo khung thời gian đã chọn" data={data.revenueByPeriod} />
      </section>
    </div>
  );
}
