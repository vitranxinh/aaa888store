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

  const cards = [
    { label: "Khách hàng", value: data.customerCount, icon: "👥", tone: "border-slate-200 bg-white" },
    { label: "Sản phẩm", value: data.productCount, icon: "📦", tone: "border-slate-200 bg-white" },
    { label: "Hóa đơn", value: data.invoiceCount, icon: "🧾", tone: "border-slate-200 bg-white" },
    { label: "Doanh thu", value: formatCurrency(data.revenue), icon: "💰", tone: "border-emerald-200 bg-emerald-50/60" },
    { label: "Công nợ", value: formatCurrency(data.debt), icon: "📋", tone: "border-amber-200 bg-amber-50/60" },
    { label: "Sắp hết hàng", value: data.lowStockCount, icon: "⚠️", tone: "border-rose-200 bg-rose-50/60" }
  ];

  return (
    <div className="space-y-8">
      <AppHeader title="Tổng quan" description="Quầy 302 Hapulico - Quản lý bán sỉ" session={session} />

      <div className="flex flex-wrap gap-2">
        {ranges.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard?range=${item.value}`}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              range === item.value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 shadow-soft"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section className="grid gap-5 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-7 shadow-soft ${card.tone}`}>
            <div className="flex items-start justify-between">
              <p className="text-[22px] font-semibold text-slate-500">{card.label}</p>
              <span className="text-3xl">{card.icon}</span>
            </div>
            <p className="mt-7 text-5xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Doanh thu theo thời gian" description="Doanh thu theo khung thời gian đã chọn" data={data.revenueByPeriod} />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-2xl font-bold text-slate-900">Hóa đơn gần đây</h3>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xl text-slate-500">
                <tr>
                  <th className="px-6 py-4">Mã HĐ</th>
                  <th className="px-6 py-4">Khách hàng</th>
                  <th className="px-6 py-4 text-right">Tổng tiền</th>
                  <th className="px-6 py-4 text-right">Đã trả</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-slate-100 text-2xl text-slate-700">
                    <td className="px-6 py-4 font-semibold text-emerald-600">{order.code}</td>
                    <td className="px-6 py-4">{order.customer.name}</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(Number(order.grandTotal))}</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(Number(order.paidAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
