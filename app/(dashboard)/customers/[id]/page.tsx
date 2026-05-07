import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CustomerEditModal } from "@/components/customer-edit-modal";
import { requireSession } from "@/lib/auth";
import {
  getCustomerDebtDetail,
  resolveCustomerHistoryFilters,
  type CustomerInvoiceHistoryStatus
} from "@/lib/customer-debt";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatCustomerDebt, formatDate } from "@/lib/utils";

function displayCustomerPhone(phone: string | null) {
  return phone?.startsWith("AUTO_PHONE_") ? "" : phone ?? "";
}

function getHistoryStatusLabel(status: CustomerInvoiceHistoryStatus) {
  if (status === "unpaid") return "Chưa thanh toán";
  if (status === "partial") return "Thanh toán một phần";
  if (status === "paid") return "Đã thanh toán";
  return "Tất cả";
}

export default async function CustomerDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string; status?: string; code?: string; history?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageCustomers = session.role !== "CASHIER";
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";
  const filters = resolveCustomerHistoryFilters(searchParams);

  const [groups, detail] = await Promise.all([
    prisma.customerGroup.findMany({ orderBy: { name: "asc" } }),
    getCustomerDebtDetail(params.id, filters)
  ]);

  if (!detail.customer || detail.customer.code === "KH000000") {
    notFound();
  }

  const customer = detail.customer;
  const activeDebtTotal = detail.activeInvoices.reduce((sum, invoice) => sum + invoice.debtAmount, 0);
  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader
        title={customer.name}
        description={`Công nợ hiện tại: ${formatCustomerDebt(Number(customer.receivableDebt))}`}
        session={session}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/customers"
          prefetch={false}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:text-base"
        >
          Quay lại khách hàng
        </Link>
        {canManageCustomers ? (
          <CustomerEditModal
            customer={{
              id: customer.id,
              code: customer.code,
              name: customer.name,
              phone: displayCustomerPhone(customer.phone),
              email: customer.email,
              address: customer.address,
              note: customer.note,
              groupId: customer.groupId,
              openingDebt: Number(customer.openingDebt),
              currentDebt: Number(customer.receivableDebt)
            }}
            groups={groupOptions}
          />
        ) : null}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Thông tin khách hàng</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Mã khách</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{customer.code}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">{canSeeCustomerPrivateFields ? "Số điện thoại" : "Thông tin"}</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
              {canSeeCustomerPrivateFields ? displayCustomerPhone(customer.phone) || "-" : "Đã ẩn với nhân viên"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Công nợ hiện tại</p>
            <p className={`mt-1 text-lg font-bold sm:text-xl ${Number(customer.receivableDebt) > 0 ? "text-red-600" : "text-slate-700"}`}>
              {formatCustomerDebt(Number(customer.receivableDebt))}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Email</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
              {canSeeCustomerPrivateFields ? customer.email || "-" : "Đã ẩn với nhân viên"}
            </p>
          </div>
        </div>
        {canSeeCustomerPrivateFields ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Địa chỉ</p>
            <p className="mt-1 text-base leading-relaxed text-slate-800 sm:text-lg">{customer.address || "-"}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-red-100 bg-red-50/60 p-4 shadow-soft sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Khoản còn nợ</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Chỉ tính từ hóa đơn còn nợ và phiếu thu của khách hàng.</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-red-600 sm:text-base">
            {formatCustomerDebt(activeDebtTotal)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Khoản còn nợ</p>
            <p className="mt-2 text-xl font-bold text-red-600">{formatCustomerDebt(activeDebtTotal)}</p>
          </div>
          <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Hóa đơn còn nợ</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{detail.activeInvoices.length}</p>
          </div>
          <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Phiếu thu</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{detail.receipts.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Hóa đơn còn nợ</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Chỉ hiện hóa đơn chưa thanh toán hoặc thanh toán một phần.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {detail.activeInvoices.length ? (
            detail.activeInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/orders/${invoice.id}`} className="text-base font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-lg">
                      {invoice.code}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500 sm:text-base">Ngày tạo: {formatDate(invoice.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 sm:text-sm">Còn nợ</p>
                    <p className="text-base font-bold text-red-600 sm:text-lg">{formatCurrency(invoice.debtAmount)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3 sm:text-base">
                  <div><span className="font-medium text-slate-500">Tổng hóa đơn:</span> {formatCurrency(invoice.grandTotal)}</div>
                  <div><span className="font-medium text-slate-500">Đã trả:</span> {formatCurrency(invoice.paidAmount)}</div>
                  <div><span className="font-medium text-slate-500">Trạng thái thanh toán:</span> {invoice.paidAmount > 0 ? "Thanh toán một phần" : "Chưa thanh toán"}</div>
                </div>
                {invoice.note ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
                    <span className="font-medium">Ghi chú:</span> {invoice.note}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:text-base">
              Khách hàng này hiện không còn hóa đơn nào đang nợ.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Phiếu thu</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Lịch sử các phiếu thu đã ghi nhận cho khách hàng này.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {detail.receipts.length ? (
            detail.receipts.map((receipt) => (
              <div key={receipt.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-emerald-700 sm:text-lg">{receipt.code}</p>
                    <p className="mt-1 text-sm text-slate-500 sm:text-base">Ngày tạo: {formatDate(receipt.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 sm:text-sm">Số tiền</p>
                    <p className="text-base font-bold text-emerald-700 sm:text-lg">{formatCurrency(receipt.amount)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 sm:text-base">
                  <div>
                    <span className="font-medium text-slate-500">Liên kết hóa đơn:</span>{" "}
                    {receipt.orderId && receipt.orderCode ? (
                      <Link prefetch={false} href={`/orders/${receipt.orderId}`} className="text-emerald-700 underline-offset-2 hover:underline">
                        {receipt.orderCode}
                      </Link>
                    ) : (
                      "Không gắn hóa đơn"
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">Phương thức thanh toán:</span> {receipt.paymentMethodLabel}
                  </div>
                </div>
                {receipt.note ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
                    <span className="font-medium">Ghi chú:</span> {receipt.note}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:text-base">
              Khách hàng này chưa có phiếu thu nào.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Lịch sử hóa đơn</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Hiển thị toàn bộ hóa đơn của khách, kể cả hóa đơn đã thanh toán đủ.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            Bộ lọc hiện tại: {getHistoryStatusLabel(filters.status)}{filters.history === "all" ? " / Tất cả thời gian" : filters.from || filters.to ? " / Tự chọn ngày" : " / 90 ngày gần nhất"}
          </div>
        </div>

        <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto_auto] lg:items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500">Từ ngày</label>
            <input name="from" type="date" defaultValue={filters.from} className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm shadow-soft outline-none sm:text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500">Đến ngày</label>
            <input name="to" type="date" defaultValue={filters.to} className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm shadow-soft outline-none sm:text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500">Trạng thái thanh toán</label>
            <select name="status" defaultValue={filters.status} className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm shadow-soft outline-none sm:text-base">
              <option value="all">Tất cả</option>
              <option value="unpaid">Chưa thanh toán</option>
              <option value="partial">Thanh toán một phần</option>
              <option value="paid">Đã thanh toán</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500">Tìm theo mã hóa đơn</label>
            <input name="code" defaultValue={filters.code} placeholder="VD: HD000123" className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm shadow-soft outline-none sm:text-base" />
          </div>
          <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:text-base">
            Lọc
          </button>
          <Link
            prefetch={false}
            href={`/customers/${customer.id}?history=all`}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:text-base"
          >
            Xóa bộ lọc
          </Link>
        </form>

        <div className="mt-4 space-y-3">
          {detail.invoiceHistory.length ? (
            detail.invoiceHistory.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/orders/${invoice.id}`} className="text-base font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-lg">
                      {invoice.code}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500 sm:text-base">Ngày tạo: {formatDate(invoice.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 sm:text-sm">Tổng hóa đơn</p>
                    <p className="text-base font-bold text-slate-900 sm:text-lg">{formatCurrency(invoice.grandTotal)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3 sm:text-base">
                  <div><span className="font-medium text-slate-500">Đã trả:</span> {formatCurrency(invoice.paidAmount)}</div>
                  <div><span className="font-medium text-slate-500">Còn nợ:</span> {formatCurrency(invoice.debtAmount)}</div>
                  <div>
                    <span className="font-medium text-slate-500">Trạng thái thanh toán:</span>{" "}
                    {invoice.debtAmount <= 0 ? "Đã thanh toán" : invoice.paidAmount > 0 ? "Thanh toán một phần" : "Chưa thanh toán"}
                  </div>
                </div>
                {invoice.note ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
                    <span className="font-medium">Ghi chú:</span> {invoice.note}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:text-base">
              Không có hóa đơn nào khớp bộ lọc hiện tại.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
