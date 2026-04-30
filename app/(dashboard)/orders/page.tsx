import { AppHeader } from "@/components/app-header";
import { OrderCreateModal } from "@/components/order-create-modal";
import { OrderPaymentButton } from "@/components/order-payment-button";
import { OrderStatusActions } from "@/components/order-status-actions";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function OrdersPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const q = searchParams?.q ?? "";

  const [orders, customers, products] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId: session.branchId ?? undefined,
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.customer.findMany({ orderBy: { code: "desc" }, take: 300 }),
    prisma.product.findMany({ orderBy: { name: "asc" }, take: 300 })
  ]);

  return (
    <div className="space-y-8">
      <AppHeader title="Hóa đơn" description={`${orders.length} hóa đơn`} session={session} />

      <div className="flex items-center justify-between gap-4">
        <form className="w-full max-w-xl">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã HĐ, tên khách..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-2xl shadow-soft outline-none"
          />
        </form>
        <OrderCreateModal
          branchId={session.branchId ?? ""}
          customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
          products={products.map((product) => ({ id: product.id, name: product.name, sellingPrice: Number(product.sellingPrice) }))}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xl font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-4">Mã HĐ</th>
              <th className="px-6 py-4">Ngày</th>
              <th className="px-6 py-4">Khách hàng</th>
              <th className="px-6 py-4 text-right">Tổng tiền</th>
              <th className="px-6 py-4 text-right">Đã trả</th>
              <th className="px-6 py-4 text-right">Còn nợ</th>
              <th className="px-6 py-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-100 text-2xl text-slate-700">
                <td className="px-6 py-4 font-semibold text-emerald-600">{order.code}</td>
                <td className="px-6 py-4">{formatDate(order.createdAt)}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{order.customer.name}</td>
                <td className="px-6 py-4 text-right">{formatCurrency(Number(order.grandTotal))}</td>
                <td className="px-6 py-4 text-right font-semibold text-emerald-600">{formatCurrency(Number(order.paidAmount))}</td>
                <td className={`px-6 py-4 text-right font-semibold ${Number(order.debtAmount) > 0 ? "text-red-500" : "text-slate-900"}`}>
                  {formatCurrency(Number(order.debtAmount))}
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {Number(order.debtAmount) > 0 ? <OrderPaymentButton orderId={order.id} /> : null}
                    <OrderStatusActions id={order.id} status={order.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
