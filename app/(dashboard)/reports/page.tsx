import Link from "next/link";
import { ChartCard } from "@/components/chart-card";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { requireSession } from "@/lib/auth";

export default async function ReportsPage() {
  const session = await requireSession(["ADMIN", "MANAGER"]);

  const [orders, customers, inventories, orderItems] = await Promise.all([
    prisma.order.findMany({ where: { branchId: session.branchId ?? undefined, status: "COMPLETED" } }),
    prisma.customer.findMany({ orderBy: { totalSpend: "desc" }, take: 5 }),
    prisma.inventory.findMany({ where: { branchId: session.branchId ?? undefined }, include: { product: true } }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5
    })
  ]);

  const sales = orders.reduce((sum, order) => sum + Number(order.grandTotal), 0);
  const profit = orders.reduce((sum, order) => sum + Number(order.profitEstimate), 0);
  const inventoryValue = inventories.reduce(
    (sum, item) => sum + item.quantity * Number(item.product?.costPrice ?? 0),
    0
  );

  const revenueByMonth = [
    { label: "T1", revenue: sales * 0.8 },
    { label: "T2", revenue: sales * 0.92 },
    { label: "T3", revenue: sales * 0.95 },
    { label: "T4", revenue: sales }
  ];

  return (
    <div className="space-y-6">
      <div className="grid-layout">
        <Card>
          <p className="text-sm text-slate-500">Doanh số</p>
          <h3 className="mt-2 text-3xl font-semibold">{formatCurrency(sales)}</h3>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Lợi nhuận ước tính</p>
          <h3 className="mt-2 text-3xl font-semibold">{formatCurrency(profit)}</h3>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Giá trị tồn kho</p>
          <h3 className="mt-2 text-3xl font-semibold">{formatCurrency(inventoryValue)}</h3>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Xuất dữ liệu</p>
          <Link href="/api/reports/export?type=sales" className="mt-2 inline-block text-sm font-semibold text-teal-700">
            Tải CSV báo cáo bán hàng
          </Link>
        </Card>
      </div>

      <ChartCard title="Doanh thu theo tháng" description="Biểu đồ mẫu cho KPI quản trị" data={revenueByMonth} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-slate-900">Khách hàng mua nhiều nhất</h3>
          <div className="mt-4 space-y-3">
            {customers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                <div>
                  <p className="font-medium text-slate-900">{customer.name}</p>
                  <p className="text-sm text-slate-500">{customer.phone}</p>
                </div>
                <span className="text-sm font-semibold text-teal-700">{formatCurrency(Number(customer.totalSpend))}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-slate-900">Top sản phẩm theo doanh thu</h3>
          <div className="mt-4 space-y-3">
            {orderItems.map((item) => (
              <div key={item.productId} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                <div>
                  <p className="font-medium text-slate-900">Sản phẩm {item.productId.slice(-6)}</p>
                  <p className="text-sm text-slate-500">Số lượng {item._sum.quantity ?? 0}</p>
                </div>
                <span className="text-sm font-semibold text-teal-700">{formatCurrency(Number(item._sum.total ?? 0))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
