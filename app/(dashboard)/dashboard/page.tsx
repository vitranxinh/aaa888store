import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ChartCard } from "@/components/chart-card";
import { requireSession } from "@/lib/auth";
import { getDashboardData, type DashboardRange } from "@/lib/data";
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
    { label: "Sắp hết hàng", value: data.lowStockCount, icon: "⚠️", tone: "border-rose-200 bg-rose-50/60" }
  ];

  const mobileQuickLinks = [
    { href: "/suppliers", label: "Nhà cung cấp", icon: "🏭", tone: "bg-sky-50 text-sky-700 border-sky-100" },
    { href: "/cashflow", label: "Thu / Chi", icon: "💸", tone: "bg-amber-50 text-amber-700 border-amber-100" },
    { href: "/inventory", label: "Nhập hàng", icon: "📥", tone: "bg-violet-50 text-violet-700 border-violet-100" }
  ];

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
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`rounded-3xl border p-4 shadow-soft ${item.tone}`}
          >
            <div className="text-2xl">{item.icon}</div>
            <p className="mt-3 text-sm font-bold leading-snug">{item.label}</p>
          </Link>
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

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Doanh thu theo thời gian" description="Doanh thu theo khung thời gian đã chọn" data={data.revenueByPeriod} />

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
          <h3 className="text-2xl font-bold text-slate-900 sm:text-2xl">Hóa đơn gần đây</h3>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 sm:mt-5 sm:block">
            <table className="min-w-[640px] text-left sm:min-w-full">
              <thead className="bg-slate-50 text-sm text-slate-500 sm:text-xl">
                <tr>
                  <th className="px-3 py-3 sm:px-6 sm:py-4">Mã HĐ</th>
                  <th className="px-3 py-3 sm:px-6 sm:py-4">Khách hàng</th>
                  <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Tổng tiền</th>
                  <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Đã trả</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-slate-100 text-sm text-slate-700 sm:text-2xl">
                    <td className="px-3 py-3 font-semibold text-emerald-600 sm:px-6 sm:py-4">{order.code}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">{order.customer.name}</td>
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(Number(order.grandTotal))}</td>
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(Number(order.paidAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-3 sm:hidden">
            {data.recentOrders.map((order) => (
              <div key={order.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-bold text-emerald-600">{order.code}</p>
                  <p className="text-xs font-semibold whitespace-nowrap text-slate-500">{formatCurrency(Number(order.grandTotal))}</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-900">{order.customer.name}</p>
                <p className="mt-1 text-xs whitespace-nowrap text-slate-500">Đã trả {formatCurrency(Number(order.paidAmount))}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
