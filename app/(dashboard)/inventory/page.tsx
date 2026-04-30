import { AppHeader } from "@/components/app-header";
import { PurchaseCreateModal } from "@/components/purchase-create-modal";
import { PurchaseEditModal } from "@/components/purchase-edit-modal";
import { requireSession } from "@/lib/auth";
import { resolveVietnamDateRange, type TimeFilterRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InventoryPage({
  searchParams
}: {
  searchParams?: { q?: string; range?: string; dateFrom?: string; dateTo?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const q = searchParams?.q ?? "";
  const range = ((searchParams?.range as TimeFilterRange | undefined) ?? "all") as TimeFilterRange;
  const dateFrom = searchParams?.dateFrom ?? "";
  const dateTo = searchParams?.dateTo ?? "";
  const createdAt = resolveVietnamDateRange(range, dateFrom, dateTo);
  const purchaseWhere = {
    branchId: session.branchId ?? undefined,
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { supplier: { name: { contains: q, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };
  const [purchases, purchaseCount, suppliers, products] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: purchaseWhere,
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.purchaseOrder.count({ where: purchaseWhere }),
    prisma.supplier.findMany({ orderBy: { code: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" }, take: 300 })
  ]);

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Phiếu nhập hàng" description={`${purchaseCount} phiếu nhập`} session={session} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo mã phiếu, NCC..."
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:max-w-sm sm:text-lg"
          />
          <select
            name="range"
            defaultValue={range}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:w-auto sm:text-lg"
          >
            <option value="all">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
            <option value="7d">7 ngày</option>
            <option value="30d">30 ngày</option>
            <option value="month">Tháng này</option>
            <option value="custom">Tùy chọn ngày</option>
          </select>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:w-auto sm:text-lg"
          />
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:w-auto sm:text-lg"
          />
          <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg">
            Lọc
          </button>
        </form>
        <PurchaseCreateModal
          branchId={session.branchId ?? ""}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
        />
      </div>

      <div className="grid gap-3 sm:hidden">
        {purchases.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-soft">
            Chưa có phiếu nhập trong khung lọc này.
          </div>
        ) : (
          purchases.map((item) => (
            <div key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.code}</p>
                  <p className="mt-1 text-[1.1rem] font-bold leading-snug text-slate-900">{item.supplier.name}</p>
                  <p className="mt-1 text-[0.9rem] text-slate-500">{formatDate(item.createdAt)}</p>
                </div>
                <div className="rounded-2xl bg-red-50 px-3 py-2 text-right">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-red-500">Còn nợ</p>
                  <p className="mt-1 text-[1.05rem] font-bold text-red-600">{formatCurrency(Number(item.debtAmount))}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[0.85rem] font-medium text-slate-400">Tổng tiền</span>
                  <span className="text-[0.98rem] font-semibold text-slate-800">{formatCurrency(Number(item.totalAmount))}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
                  <span className="text-[0.85rem] font-medium text-slate-400">Đã trả</span>
                  <span className="text-[0.98rem] font-semibold text-emerald-600">{formatCurrency(Number(item.paidAmount))}</span>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <p className="text-[0.85rem] font-medium text-slate-400">Sản phẩm</p>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-slate-700">
                    {item.items.length} dòng hàng
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <PurchaseEditModal
                  purchase={{
                    id: item.id,
                    code: item.code,
                    branchId: item.branchId,
                    supplierId: item.supplierId,
                    paidAmount: Number(item.paidAmount),
                    note: item.note,
                    items: item.items.map((purchaseItem) => ({
                      productId: purchaseItem.productId,
                      quantity: purchaseItem.quantity,
                      importPrice: Number(purchaseItem.importPrice),
                      batchNumber: purchaseItem.batchNumber,
                      expiryDate: purchaseItem.expiryDate ? purchaseItem.expiryDate.toISOString().slice(0, 10) : ""
                    }))
                  }}
                  suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
                  products={products.map((product) => ({ id: product.id, name: product.name }))}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className="min-w-[920px] text-left">
          <thead className="bg-slate-50 text-sm font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã phiếu</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Ngày</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">NCC</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Tổng tiền</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Đã trả</th>
              <th className="px-3 py-3 text-right text-red-600 sm:px-6 sm:py-4">Còn nợ</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-400 sm:px-6 sm:py-12 sm:text-2xl">Chưa có phiếu nhập</td>
              </tr>
            ) : (
              purchases.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 text-sm text-slate-700 sm:text-2xl">
                  <td className="px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">{item.code}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{item.supplier.name}</td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(Number(item.totalAmount))}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 sm:px-6 sm:py-4">{formatCurrency(Number(item.paidAmount))}</td>
                  <td className="px-3 py-3 text-right font-semibold text-red-600 sm:px-6 sm:py-4">
                    {formatCurrency(Number(item.debtAmount))}
                  </td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                    <PurchaseEditModal
                      purchase={{
                        id: item.id,
                        code: item.code,
                        branchId: item.branchId,
                        supplierId: item.supplierId,
                        paidAmount: Number(item.paidAmount),
                        note: item.note,
                        items: item.items.map((purchaseItem) => ({
                          productId: purchaseItem.productId,
                          quantity: purchaseItem.quantity,
                          importPrice: Number(purchaseItem.importPrice),
                          batchNumber: purchaseItem.batchNumber,
                          expiryDate: purchaseItem.expiryDate ? purchaseItem.expiryDate.toISOString().slice(0, 10) : ""
                        }))
                      }}
                      suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
                      products={products.map((product) => ({ id: product.id, name: product.name }))}
                    />
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
