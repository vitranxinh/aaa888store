import { AppHeader } from "@/components/app-header";
import { PurchaseCreateModal } from "@/components/purchase-create-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InventoryPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const q = searchParams?.q ?? "";
  const [purchases, suppliers, products] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        branchId: session.branchId ?? undefined,
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { supplier: { name: { contains: q, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.supplier.findMany({ orderBy: { code: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" }, take: 300 })
  ]);

  return (
    <div className="space-y-8">
      <AppHeader title="Phiếu nhập hàng" description={`${purchases.length} phiếu nhập`} session={session} />

      <div className="flex items-center justify-between gap-4">
        <form className="w-full max-w-xl">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã phiếu, NCC..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-2xl shadow-soft outline-none"
          />
        </form>
        <PurchaseCreateModal
          branchId={session.branchId ?? ""}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xl font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-4">Mã phiếu</th>
              <th className="px-6 py-4">Ngày</th>
              <th className="px-6 py-4">NCC</th>
              <th className="px-6 py-4 text-right">Tổng tiền</th>
              <th className="px-6 py-4 text-right">Đã trả</th>
              <th className="px-6 py-4 text-right">Còn nợ</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-2xl text-slate-400">Chưa có phiếu nhập</td>
              </tr>
            ) : (
              purchases.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-2xl text-slate-700">
                  <td className="px-6 py-4 font-semibold text-slate-900">{item.code}</td>
                  <td className="px-6 py-4">{formatDate(item.createdAt)}</td>
                  <td className="px-6 py-4">{item.supplier.name}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(Number(item.totalAmount))}</td>
                  <td className="px-6 py-4 text-right text-emerald-600">{formatCurrency(Number(item.paidAmount))}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${Number(item.debtAmount) > 0 ? "text-red-500" : "text-slate-900"}`}>
                    {formatCurrency(Number(item.debtAmount))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
