import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { InvoicePdfActions } from "@/components/invoice-pdf-actions";
import { OrderEditModal } from "@/components/order-edit-modal";
import { OrderPaymentButton } from "@/components/order-payment-button";
import { OrderStatusActions } from "@/components/order-status-actions";
import { getOrderDetail } from "@/lib/order-detail";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function OrderDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { created?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";
  const [order, deleteRequest] = await Promise.all([
    getOrderDetail(params.id),
    prisma.orderDeleteRequest.findUnique({
      where: { orderId: params.id },
      include: {
        requestedBy: { select: { name: true } }
      }
    })
  ]);

  if (!order || (session.branchId && order.branchId !== session.branchId)) {
    notFound();
  }

  if (deleteRequest?.status === "PENDING" && session.role !== "ADMIN") {
    notFound();
  }

  const created = searchParams?.created === "1";
  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader
        title={`Hóa đơn ${order.code}`}
        description={canSeeCustomerPrivateFields ? `Khách hàng: ${order.customer.name}` : "Thông tin khách hàng chi tiết đang được ẩn"}
        session={session}
      />

      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:text-base">
          Đã tạo hóa đơn thành công. Bạn có thể kiểm tra lại chi tiết hoặc xuất hóa đơn ngay từ màn này.
        </div>
      ) : null}

      {deleteRequest?.status === "PENDING" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 sm:text-base">
          Hóa đơn này đang có yêu cầu xóa từ {deleteRequest.requestedBy.name}. Chỉ tài khoản sếp mới có thể duyệt hoặc từ chối.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <OrderEditModal
            orderId={order.id}
            branchId={order.branchId}
            customerId={order.customerId}
            customerName={order.customer.name}
            note={order.note || ""}
            otherCharge={Number(order.otherCharge)}
            paidAmount={Number(order.paidAmount)}
            lines={order.items.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              discountValue: Number(item.discountValue)
            }))}
          />
          {Number(order.debtAmount) > 0 ? <OrderPaymentButton orderId={order.id} remainingAmount={Number(order.debtAmount)} /> : null}
          <OrderStatusActions
            id={order.id}
            role={session.role}
            hasPendingDeleteRequest={deleteRequest?.status === "PENDING"}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/invoice/${order.id}`}
            target="_blank"
            rel="noreferrer"
            prefetch={false}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:text-base"
          >
            In hóa đơn
          </Link>
          <Link
            href="/orders"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:text-base"
          >
            Quay lại hóa đơn
          </Link>
          <InvoicePdfActions
            code={order.code}
            branchName={order.branch.name}
            branchAddress={order.branch.address || ""}
            branchPhone={order.branch.phone || ""}
            createdAtLabel={formatDate(order.createdAt)}
            createdByName={order.createdBy.name}
            customerCode={order.customer.code}
            customerName={order.customer.name}
            customerPhone={order.customer.phone || "-"}
            customerAddress={order.customer.address || "-"}
            paymentMethodLabel={
              order.paymentMethod === "BANK_TRANSFER" ? "Chuyển khoản" : order.paymentMethod === "MIXED" ? "Hỗn hợp" : "Tiền mặt"
            }
            note={order.note || ""}
            subtotal={Number(order.subtotal)}
            discountTotal={Number(order.discountTotal)}
            otherCharge={Number(order.otherCharge)}
            paidAmount={Number(order.paidAmount)}
            debtAmount={Number(order.debtAmount)}
            grandTotal={Number(order.grandTotal)}
            items={order.items.map((item) => ({
              sku: item.product.sku,
              name: item.product.name,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              total: Number(item.total)
            }))}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.85fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thông tin hóa đơn</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Mã hóa đơn</p>
              <p className="mt-1 text-xl font-bold text-emerald-600 sm:text-2xl">{order.code}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Ngày tạo</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{formatDate(order.createdAt)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Người lập</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{order.createdBy.name}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Phương thức</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">
                {order.paymentMethod === "BANK_TRANSFER"
                  ? "Chuyển khoản"
                  : order.paymentMethod === "MIXED"
                    ? "Hỗn hợp"
                    : "Tiền mặt"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3 sm:hidden">
            {order.items.map((item, index) => (
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
                <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Số lượng</p>
                    <p className="mt-1 text-base font-bold text-slate-900">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Đơn giá</p>
                    <p className="mt-1 text-sm font-bold whitespace-nowrap text-slate-900">{formatCurrency(Number(item.unitPrice))}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">Thành tiền</p>
                    <p className="mt-1 text-sm font-bold whitespace-nowrap text-slate-900">{formatCurrency(Number(item.total))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 hidden rounded-3xl border border-slate-200 sm:block">
            <div className="grid grid-cols-[minmax(0,1.9fr)_100px_140px_160px] gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <div>Sản phẩm</div>
              <div>Số lượng</div>
              <div>Đơn giá</div>
              <div className="text-right">Thành tiền</div>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1.9fr)_100px_140px_160px] gap-2 px-5 py-4"
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
                  <div className="text-lg font-semibold whitespace-nowrap text-slate-700">{formatCurrency(Number(item.unitPrice))}</div>
                  <div className="text-right text-lg font-bold whitespace-nowrap text-slate-900">{formatCurrency(Number(item.total))}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thông tin khách</h2>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Khách hàng</p>
                <p className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">{order.customer.name}</p>
              </div>
              {canSeeCustomerPrivateFields ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Mã khách</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">{order.customer.code}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Số điện thoại</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">{order.customer.phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Địa chỉ</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">{order.customer.address || "-"}</p>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:text-base">
                  Số điện thoại, địa chỉ và mã khách chỉ hiển thị cho tài khoản quản lý. Khi in hoặc chia sẻ PDF, thông tin vẫn đầy đủ.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thanh toán</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500 sm:text-base">Tổng tiền hàng</span>
                <span className="text-sm font-bold whitespace-nowrap text-slate-900 sm:text-xl">{formatCurrency(Number(order.subtotal))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500 sm:text-base">Giảm giá</span>
                <span className="text-sm font-bold whitespace-nowrap text-slate-900 sm:text-xl">{formatCurrency(Number(order.discountTotal))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500 sm:text-base">Thu khác</span>
                <span className="text-sm font-bold whitespace-nowrap text-slate-900 sm:text-xl">{formatCurrency(Number(order.otherCharge))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                <span className="text-sm font-medium text-emerald-700 sm:text-base">Đã trả</span>
                <span className="text-sm font-bold whitespace-nowrap text-emerald-700 sm:text-xl">{formatCurrency(Number(order.paidAmount))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3">
                <span className="text-sm font-medium text-red-600 sm:text-base">Còn nợ</span>
                <span className="text-sm font-bold whitespace-nowrap text-red-600 sm:text-xl">{formatCurrency(Number(order.debtAmount))}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-white">
                <span className="text-sm font-medium sm:text-base">Tổng thanh toán</span>
                <span className="text-base font-bold whitespace-nowrap sm:text-2xl">{formatCurrency(Number(order.grandTotal))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Ghi chú</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-600 sm:text-base">{order.note || "Không có ghi chú."}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Lịch sử thanh toán</h2>
            {order.cashTxns.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 sm:text-base">Chưa có phiếu thu nào cho hóa đơn này.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {order.cashTxns.map((txn) => (
                  <div key={txn.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 sm:text-base">{txn.code}</p>
                        <p className="mt-1 text-xs text-slate-500 sm:text-sm">{formatDate(txn.createdAt)}</p>
                      </div>
                      <p className="text-sm font-bold whitespace-nowrap text-emerald-700 sm:text-lg">{formatCurrency(Number(txn.amount))}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{txn.note || "Thu tiền hóa đơn"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
