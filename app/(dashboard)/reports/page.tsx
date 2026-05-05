import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { ChartCard } from "@/components/chart-card";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { requireSession } from "@/lib/auth";

async function getReportsData(branchId?: string) {
  const branchWhere = { branchId: branchId ?? undefined };

  const [salesAggregate, customers, orderItems] = await Promise.all([
    prisma.order.aggregate({
      where: { ...branchWhere, status: "COMPLETED" },
      _sum: { grandTotal: true, profitEstimate: true }
    }),
    prisma.customer.findMany({
      orderBy: { totalSpend: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        phone: true,
        totalSpend: true
      }
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5
    })
  ]);

  const inventoryValueAggregate = await prisma.$queryRaw<Array<{ total_value: number }>>`
    SELECT COALESCE(SUM(i."quantity" * p."costPrice"), 0)::float as total_value
    FROM "Inventory" i
    JOIN "Product" p ON i."productId" = p.id
    WHERE (${branchId === undefined} OR i."branchId" = ${branchId})
  `;

  const sales = Number(salesAggregate._sum.grandTotal ?? 0);
  const profit = Number(salesAggregate._sum.profitEstimate ?? 0);
  const inventoryValue = inventoryValueAggregate[0]?.total_value ?? 0;

  return {
    sales,
    profit,
    inventoryValue,
    customers,
    orderItems
  };
}

async function getCachedReportsData(branchId?: string) {
  return unstable_cache(
    () => getReportsData(branchId),
    ["reports-data", branchId ?? "all"],
    { revalidate: 60 }
  )();
}

export default async function ReportsPage() {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canExportExcel = session.role !== "CASHIER";
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";
  const { sales, profit, inventoryValue, customers, orderItems } = await getCachedReportsData(session.branchId ?? undefined);

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
          {canExportExcel ? (
            <Link href="/api/reports/export?type=sales" className="mt-2 inline-block text-sm font-semibold text-teal-700">
              Tải CSV báo cáo bán hàng
            </Link>
          ) : (
            <p className="mt-2 text-sm font-medium text-slate-400">Tài khoản nhân viên không được tải Excel/CSV.</p>
          )}
        </Card>
      </div>

      <ChartCard title="Doanh thu theo tháng" description="Biểu đồ mẫu cho KPI quản trị" data={revenueByMonth} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-slate-900">Khách hàng mua nhiều nhất</h3>
          <div className="mt-4 space-y-3">
            {customers.map((customer: { id: string; name: string; phone: string | null; totalSpend: Prisma.Decimal }) => (
              <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                <div>
                  <p className="font-medium text-slate-900">{customer.name}</p>
                  <p className="text-sm text-slate-500">{canSeeCustomerPrivateFields ? customer.phone : "Thông tin liên hệ bị ẩn"}</p>
                </div>
                <span className="text-sm font-semibold text-teal-700">{formatCurrency(Number(customer.totalSpend))}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-slate-900">Top sản phẩm theo doanh thu</h3>
          <div className="mt-4 space-y-3">
            {orderItems.map((item: { productId: string; _sum: { quantity: number | null; total: Prisma.Decimal | null } }) => (
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
