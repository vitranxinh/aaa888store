import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PurchaseEditModal } from "@/components/purchase-edit-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PurchaseDetailPage({
  params
}: {
  params: { id: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const purchase = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      branchId: true,
      supplierId: true,
      note: true,
      totalAmount: true,
      paidAmount: true,
      debtAmount: true,
      createdAt: true,
      supplier: {
        select: {
          name: true
        }
      },
      createdBy: {
        select: {
          name: true
        }
      },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          importPrice: true,
          total: true,
          batchNumber: true,
          expiryDate: true,
          product: {
            select: {
              name: true,
              sku: true,
              imageUrl: true
            }
          }
        }
      }
    }
  });

  if (!purchase || (session.branchId && purchase.branchId !== session.branchId)) {
    notFound();
  }

  const sortedItems = [...purchase.items].sort((a, b) => a.product.name.localeCompare(b.product.name, "vi"));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader
        title={`Phiếu nhập ${purchase.code}`}
        description={`Đã nhận ${sortedItems.length} dòng hàng trong đơn nhập này`}
        session={session}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/inventory"
          prefetch={false}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:text-base"
        >
          Quay lại nhập hàng
        </Link>
        <PurchaseEditModal
          purchase={{
            id: purchase.id,
            code: purchase.code,
            branchId: purchase.branchId,
            supplierId: purchase.supplierId,
            paidAmount: Number(purchase.paidAmount),
            note: purchase.note,
            items: sortedItems.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              importPrice: Number(item.importPrice),
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : ""
            }))
          }}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Hàng đã nhận</h2>

          <div className="mt-4 space-y-3 sm:hidden">
            {sortedItems.map((item, index) => (
              <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold leading-snug text-slate-900">{item.product.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.product.sku}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Số lượng</p>
                    <p className="mt-1 text-base font-bold text-slate-900">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Giá nhập</p>
                    <p className="mt-1 text-sm font-bold whitespace-nowrap text-slate-900">{formatCurrency(Number(item.importPrice))}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Số lô</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{item.batchNumber}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Hạn dùng</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {item.expiryDate ? formatDate(item.expiryDate) : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-3">
                  <span className="text-sm font-medium text-emerald-700">Thành tiền</span>
                  <span className="text-base font-bold text-emerald-700">{formatCurrency(Number(item.total))}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 hidden rounded-3xl border border-slate-200 sm:block">
            <div className="grid grid-cols-[minmax(0,1.8fr)_100px_140px_160px_140px_160px] gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <div>Sản phẩm</div>
              <div>Số lượng</div>
              <div>Giá nhập</div>
              <div>Số lô</div>
              <div>Hạn dùng</div>
              <div className="text-right">Thành tiền</div>
            </div>
            <div className="divide-y divide-slate-100">
              {sortedItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1.8fr)_100px_140px_160px_140px_160px] gap-2 px-5 py-4"
                >
                  <div className="flex gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                      {item.product.imageUrl ? (
                        <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-slate-900">{item.product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.product.sku}</p>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-slate-700">{item.quantity}</div>
                  <div className="text-lg font-semibold whitespace-nowrap text-slate-700">{formatCurrency(Number(item.importPrice))}</div>
                  <div className="text-lg font-semibold text-slate-700">{item.batchNumber}</div>
                  <div className="text-lg font-semibold text-slate-700">
                    {item.expiryDate ? formatDate(item.expiryDate) : "-"}
                  </div>
                  <div className="text-right text-lg font-bold whitespace-nowrap text-slate-900">{formatCurrency(Number(item.total))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thông tin phiếu nhập</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-500">Mã phiếu</p>
                <p className="mt-1 text-xl font-bold text-emerald-600 sm:text-2xl">{purchase.code}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-500">Ngày nhập</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{formatDate(purchase.createdAt)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-500">Đơn nhập hàng</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{purchase.code}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-500">Người lập</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{purchase.createdBy.name}</p>
              </div>
              {purchase.note ? (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">Ghi chú</p>
                  <p className="mt-1 text-base leading-relaxed text-slate-800 sm:text-lg">{purchase.note}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thanh toán</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4">
                <span className="text-sm font-medium text-slate-500 sm:text-base">Tổng tiền</span>
                <span className="text-base font-bold text-slate-900 sm:text-xl">{formatCurrency(Number(purchase.totalAmount))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-4">
                <span className="text-sm font-medium text-emerald-700 sm:text-base">Đã trả</span>
                <span className="text-base font-bold text-emerald-700 sm:text-xl">{formatCurrency(Number(purchase.paidAmount))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-red-50 px-4 py-4">
                <span className="text-sm font-medium text-red-700 sm:text-base">Còn nợ</span>
                <span className="text-base font-bold text-red-700 sm:text-xl">{formatCurrency(Number(purchase.debtAmount))}</span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
