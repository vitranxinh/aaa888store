import { AppHeader } from "@/components/app-header";
import { CashflowCreateModal } from "@/components/cashflow-create-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function CashflowPage() {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const [transactions, orders, purchases, customers, suppliers] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { branchId: session.branchId ?? undefined },
      include: { customer: true, supplier: true, order: true, purchaseOrder: true },
      orderBy: { createdAt: "desc" },
      take: 40
    }),
    prisma.order.findMany({ where: { branchId: session.branchId ?? undefined }, select: { id: true, code: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.purchaseOrder.findMany({ where: { branchId: session.branchId ?? undefined }, select: { id: true, code: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { code: "desc" }, take: 100 }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { code: "asc" }, take: 100 })
  ]);

  return (
    <div className="space-y-8">
      <AppHeader title="Thu / Chi" description={`${transactions.length} giao dịch`} session={session} />
      <div className="flex justify-end">
        <CashflowCreateModal branchId={session.branchId ?? ""} orders={orders} purchases={purchases} customers={customers} suppliers={suppliers} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xl font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-4">Mã phiếu</th>
              <th className="px-6 py-4">Ngày</th>
              <th className="px-6 py-4">Loại</th>
              <th className="px-6 py-4">Đối tượng</th>
              <th className="px-6 py-4">Liên kết</th>
              <th className="px-6 py-4 text-right">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 text-2xl text-slate-700">
                <td className="px-6 py-4 font-semibold text-slate-900">{item.code}</td>
                <td className="px-6 py-4">{formatDate(item.createdAt)}</td>
                <td className="px-6 py-4">{item.type === "RECEIPT" ? "Thu" : "Chi"}</td>
                <td className="px-6 py-4">{item.customer?.name ?? item.supplier?.name ?? "-"}</td>
                <td className="px-6 py-4">{item.order?.code ?? item.purchaseOrder?.code ?? "-"}</td>
                <td className={`px-6 py-4 text-right font-semibold ${item.type === "RECEIPT" ? "text-emerald-600" : "text-red-500"}`}>
                  {formatCurrency(Number(item.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
