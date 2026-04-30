import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CustomerEditModal } from "@/components/customer-edit-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

type DebtHistoryItem = {
  id: string;
  code: string;
  createdAt: Date;
  kind: "ORDER_DEBT" | "RECEIPT";
  orderCode?: string | null;
  grandTotal?: number;
  paidAmount?: number;
  debtAmount?: number;
  amount?: number;
  note: string | null;
};

export default async function CustomerDetailPage({
  params
}: {
  params: { id: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageCustomers = session.role !== "CASHIER";
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";

  const [customer, groups, debtOrders, receiptTransactions] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: params.id }
    }),
    prisma.customerGroup.findMany({ orderBy: { name: "asc" } }),
    prisma.order.findMany({
      where: {
        customerId: params.id,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        debtAmount: true,
        note: true
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.cashTransaction.findMany({
      where: {
        customerId: params.id,
        type: "RECEIPT"
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        amount: true,
        note: true,
        order: {
          select: {
            code: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    })
  ]);

  if (!customer || customer.code === "KH000000") {
    notFound();
  }

  const debtHistory: DebtHistoryItem[] = [
    ...debtOrders
      .filter((order) => Number(order.debtAmount ?? 0) > 0)
      .map((order) => ({
        id: order.id,
        code: order.code,
        createdAt: order.createdAt,
        kind: "ORDER_DEBT" as const,
        grandTotal: Number(order.grandTotal),
        paidAmount: Number(order.paidAmount),
        debtAmount: Number(order.debtAmount),
        note: order.note
      })),
    ...receiptTransactions.map((receipt) => ({
      id: receipt.id,
      code: receipt.code,
      createdAt: receipt.createdAt,
      kind: "RECEIPT" as const,
      orderCode: receipt.order?.code ?? null,
      amount: Number(receipt.amount),
      note: receipt.note
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader
        title={customer.name}
        description={`Công nợ hiện tại: ${formatCurrency(Number(customer.receivableDebt))}`}
        session={session}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/customers"
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
              phone: customer.phone,
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
              {canSeeCustomerPrivateFields ? customer.phone || "-" : "Đã ẩn với nhân viên"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Công nợ hiện tại</p>
            <p className="mt-1 text-lg font-bold text-red-600 sm:text-xl">{formatCurrency(Number(customer.receivableDebt))}</p>
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Chi tiết công nợ</h2>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Record cả hóa đơn còn nợ và các phiếu thu để dễ đối chiếu.</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-red-600 sm:text-base">
            {debtHistory.length} giao dịch
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {debtHistory.length ? (
            debtHistory.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {entry.kind === "ORDER_DEBT" ? (
                      <Link href={`/orders/${entry.id}`} className="text-base font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-lg">
                        {entry.code}
                      </Link>
                    ) : (
                      <p className="text-base font-bold text-emerald-700 sm:text-lg">{entry.code}</p>
                    )}
                    <p className="mt-1 text-sm text-slate-500 sm:text-base">Ngày tạo: {formatDate(entry.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 sm:text-sm">{entry.kind === "ORDER_DEBT" ? "Còn nợ" : "Đã thu"}</p>
                    <p className={`text-base font-bold sm:text-lg ${entry.kind === "ORDER_DEBT" ? "text-red-600" : "text-emerald-700"}`}>
                      {formatCurrency(entry.kind === "ORDER_DEBT" ? (entry.debtAmount ?? 0) : (entry.amount ?? 0))}
                    </p>
                  </div>
                </div>

                {entry.kind === "ORDER_DEBT" ? (
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 sm:text-base">
                    <div>
                      <span className="font-medium text-slate-500">Tổng hóa đơn:</span> {formatCurrency(entry.grandTotal ?? 0)}
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Đã trả:</span> {formatCurrency(entry.paidAmount ?? 0)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-1 text-sm text-slate-600 sm:text-base">
                    <div>
                      <span className="font-medium text-slate-500">Loại giao dịch:</span>{" "}
                      {entry.orderCode ? "Phiếu thu gắn hóa đơn" : "Phiếu thu không gắn hóa đơn"}
                    </div>
                    {entry.orderCode ? (
                      <div>
                        <span className="font-medium text-slate-500">Thu cho hóa đơn:</span> {entry.orderCode}
                      </div>
                    ) : null}
                  </div>
                )}

                {entry.note ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
                    <span className="font-medium">Ghi chú:</span> {entry.note}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:text-base">
              Khách hàng này chưa có công nợ hoặc phiếu thu để đối chiếu.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
