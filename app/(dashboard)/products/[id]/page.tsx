import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ProductEditModal } from "@/components/product-edit-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultBranchId } from "@/lib/reference-data";
import { formatCurrency, formatDate } from "@/lib/utils";

function getPurchaseStatusLabel(status: "DRAFT" | "COMPLETED" | "PARTIAL" | "CANCELLED") {
  if (status === "COMPLETED") return "Đã thanh toán";
  if (status === "PARTIAL") return "Còn nợ";
  if (status === "CANCELLED") return "Đã hủy";
  return "Nháp";
}

function getPurchaseStatusClass(status: "DRAFT" | "COMPLETED" | "PARTIAL" | "CANCELLED") {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "PARTIAL") return "bg-red-50 text-red-600";
  if (status === "CANCELLED") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

export default async function ProductDetailPage({
  params
}: {
  params: { id: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const branchId = session.branchId ?? (await getDefaultBranchId()) ?? "";
  const canEditProducts = session.role === "ADMIN" || session.role === "MANAGER";
  const canDeleteProducts = session.role === "ADMIN";

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      inventories: {
        where: {
          branchId,
          variantId: null
        },
        select: { quantity: true }
      },
      purchaseItems: {
        where: {
          purchaseOrder: {
            ...(session.branchId ? { branchId: session.branchId } : {})
          }
        },
        select: {
          id: true,
          quantity: true,
          importPrice: true,
          total: true,
          batchNumber: true,
          expiryDate: true,
          purchaseOrder: {
            select: {
              id: true,
              code: true,
              status: true,
              createdAt: true,
              totalAmount: true,
              paidAmount: true,
              debtAmount: true,
              supplier: {
                select: { name: true }
              },
              createdBy: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: {
          purchaseOrder: {
            createdAt: "desc"
          }
        }
      },
      _count: {
        select: {
          inventories: true,
          batches: true,
          orderItems: true,
          purchaseItems: true,
          inventoryTxns: true
        }
      }
    }
  });

  if (!product) {
    notFound();
  }

  const currentQuantity = product.inventories.reduce((sum, inventory) => sum + inventory.quantity, 0);
  const purchaseHistory = product.purchaseItems;
  const totalImportedQuantity = purchaseHistory.reduce((sum, item) => sum + item.quantity, 0);
  const totalImportedAmount = purchaseHistory.reduce((sum, item) => sum + Number(item.total), 0);
  const lastImportedAt = purchaseHistory[0]?.purchaseOrder.createdAt ?? null;
  const hasRelatedHistory =
    product._count.inventories > 0 ||
    product._count.batches > 0 ||
    product._count.orderItems > 0 ||
    product._count.purchaseItems > 0 ||
    product._count.inventoryTxns > 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader
        title={product.name}
        description={`Mã hàng: ${product.sku}`}
        session={session}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/products"
          prefetch={false}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:text-base"
        >
          Quay lại hàng hóa
        </Link>
        {canEditProducts ? (
          <ProductEditModal
            product={{
              id: product.id,
              name: product.name,
              sku: product.sku,
              imageUrl: product.imageUrl,
              categoryId: product.categoryId,
              brandId: product.brandId,
              expiryDate: product.expiryDate ? product.expiryDate.toISOString() : null,
              sellingPrice: Number(product.sellingPrice)
            }}
            currentQuantity={currentQuantity}
            status={product.status}
            hasRelatedHistory={hasRelatedHistory}
            canDelete={canDeleteProducts}
          />
        ) : null}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thông tin hàng hóa</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Mã hàng</p>
            <p className="mt-1 break-words text-lg font-bold text-slate-900 sm:text-xl">{product.sku}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Nhóm hàng</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{product.category?.name ?? "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Giá bán</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{formatCurrency(Number(product.sellingPrice))}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Tồn kho</p>
            <p className={`mt-1 text-lg font-bold sm:text-xl ${currentQuantity <= product.lowStockAlert ? "text-red-600" : "text-slate-900"}`}>
              {currentQuantity}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Barcode</p>
            <p className="mt-1 break-words text-base font-semibold text-slate-800 sm:text-lg">{product.barcode ?? "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Thương hiệu</p>
            <p className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">{product.brand?.name ?? "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Hạn dùng</p>
            <p className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">
              {product.expiryDate ? formatDate(product.expiryDate) : "-"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Trạng thái</p>
            <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              product.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {product.status === "ACTIVE" ? "Đang bán" : "Đã ẩn"}
            </p>
          </div>
        </div>

        {product.description ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Mô tả</p>
            <p className="mt-1 text-base leading-relaxed text-slate-800 sm:text-lg">{product.description}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Lịch sử nhập hàng</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Chỉ hiển thị các lần nhập từ phiếu nhập hàng.</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 sm:text-base">
            {purchaseHistory.length} lần nhập
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Tổng số lượng đã nhập</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{totalImportedQuantity}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Tổng tiền nhập</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(totalImportedAmount)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Lần nhập gần nhất</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{lastImportedAt ? formatDate(lastImportedAt) : "-"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:hidden">
          {purchaseHistory.length ? (
            purchaseHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">{formatDate(item.purchaseOrder.createdAt)}</p>
                    <Link
                      prefetch={false}
                      href={`/inventory/${item.purchaseOrder.id}`}
                      className="mt-1 block text-base font-bold text-emerald-700 underline-offset-2 hover:underline"
                    >
                      {item.purchaseOrder.code}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">{item.purchaseOrder.supplier.name}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getPurchaseStatusClass(item.purchaseOrder.status)}`}>
                    {getPurchaseStatusLabel(item.purchaseOrder.status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-white p-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Số lượng</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Giá nhập</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(Number(item.importPrice))}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Số lô</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.batchNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Hạn dùng</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.expiryDate ? formatDate(item.expiryDate) : "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-medium text-slate-400">Thành tiền</p>
                    <p className="mt-1 text-base font-bold text-emerald-700">{formatCurrency(Number(item.total))}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Hàng hóa này chưa có lịch sử nhập hàng.
            </div>
          )}
        </div>

        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
          <table className="w-full table-fixed bg-white text-left">
            <thead className="bg-slate-50 text-sm font-semibold text-slate-500">
              <tr>
                <th className="w-[12%] px-4 py-3">Ngày nhập</th>
                <th className="w-[13%] px-4 py-3">Mã phiếu</th>
                <th className="w-[18%] px-4 py-3">Nhà cung cấp</th>
                <th className="w-[9%] px-4 py-3 text-right">Số lượng</th>
                <th className="w-[12%] px-4 py-3 text-right">Giá nhập</th>
                <th className="w-[13%] px-4 py-3">Số lô</th>
                <th className="w-[11%] px-4 py-3">Hạn dùng</th>
                <th className="w-[12%] px-4 py-3 text-right">Thành tiền</th>
                <th className="w-[12%] px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {purchaseHistory.length ? (
                purchaseHistory.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top text-sm text-slate-700">
                    <td className="px-4 py-3">{formatDate(item.purchaseOrder.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        prefetch={false}
                        href={`/inventory/${item.purchaseOrder.id}`}
                        className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                      >
                        {item.purchaseOrder.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{item.purchaseOrder.supplier.name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(Number(item.importPrice))}</td>
                    <td className="px-4 py-3">{item.batchNumber}</td>
                    <td className="px-4 py-3">{item.expiryDate ? formatDate(item.expiryDate) : "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(Number(item.total))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPurchaseStatusClass(item.purchaseOrder.status)}`}>
                        {getPurchaseStatusLabel(item.purchaseOrder.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                    Hàng hóa này chưa có lịch sử nhập hàng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
