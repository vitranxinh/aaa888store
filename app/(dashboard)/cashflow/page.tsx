import dynamic from "next/dynamic";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { ServerPagination } from "@/components/server-pagination";
import { requireSession } from "@/lib/auth";
import { resolveVietnamDateRange, type TimeFilterRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

const CashflowCreateModal = dynamic(
  () => import("@/components/cashflow-create-modal").then((module) => module.CashflowCreateModal),
  { ssr: false }
);

const CashflowEditModal = dynamic(
  () => import("@/components/cashflow-edit-modal").then((module) => module.CashflowEditModal),
  { ssr: false }
);

async function CashflowContent({
  branchId,
  isBossAccount,
  range,
  dateFrom,
  dateTo,
  page,
  pageSize,
  createdAt
}: {
  branchId?: string;
  isBossAccount: boolean;
  range: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  createdAt?: { gte?: Date; lte?: Date };
}) {
  const startedAt = Date.now();
  const cashflowWhere = {
    branchId,
    ...(createdAt ? { createdAt } : {})
  };
  const [transactions, summaryByEmployee, employeeUsers] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: cashflowWhere,
      select: {
        id: true,
        code: true,
        type: true,
        amount: true,
        note: true,
        orderId: true,
        purchaseOrderId: true,
        customerId: true,
        supplierId: true,
        createdAt: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        order: { select: { code: true } },
        purchaseOrder: { select: { code: true } },
        createdBy: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize + 1
    }),
    prisma.cashTransaction.groupBy({
      where: cashflowWhere,
      by: ["createdById", "type"],
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        branchId
      },
      select: {
        id: true,
        name: true
      },
      orderBy: { name: "asc" }
    })
  ]);

  const hasNext = transactions.length > pageSize;
  const visibleTransactions = hasNext ? transactions.slice(0, pageSize) : transactions;
  const totalMs = Date.now() - startedAt;
  console.info("[perf][cashflow-page]", {
    page,
    pageSize,
    range,
    rowCount: visibleTransactions.length,
    totalMs
  });

  const employeeSummaryMap = employeeUsers.reduce<
    Map<
      string,
      {
        id: string;
        name: string;
        receiptTotal: number;
        paymentTotal: number;
        transactionCount: number;
      }
    >
  >((map, user) => {
    map.set(user.id, {
      id: user.id,
      name: user.name,
      receiptTotal: 0,
      paymentTotal: 0,
      transactionCount: 0
    });
    return map;
  }, new Map());

  summaryByEmployee.forEach((item) => {
    const actorId = item.createdById ?? "unknown";
    const actorName = employeeUsers.find((user) => user.id === actorId)?.name ?? "Không rõ";
    const existing = employeeSummaryMap.get(actorId);
    const amount = Number(item._sum.amount ?? 0);
    const transactionCount = item._count._all;

    if (existing) {
      existing.transactionCount += transactionCount;
      if (item.type === "RECEIPT") {
        existing.receiptTotal += amount;
      } else {
        existing.paymentTotal += amount;
      }
      return;
    }

    employeeSummaryMap.set(actorId, {
      id: actorId,
      name: actorName,
      receiptTotal: item.type === "RECEIPT" ? amount : 0,
      paymentTotal: item.type === "PAYMENT" ? amount : 0,
      transactionCount
    });
  });

  const employeeCashSummary = Array.from(employeeSummaryMap.values());
  employeeCashSummary.sort((a, b) => (b.receiptTotal - b.paymentTotal) - (a.receiptTotal - a.paymentTotal));

  return (
    <>
      {isBossAccount ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 sm:text-2xl">Thu / Chi theo nhân viên</h3>
            <p className="text-sm text-slate-500 sm:text-lg">Tổng hợp theo đúng khung ngày đang lọc để sếp kiểm tra daily từng nhân viên.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {employeeCashSummary.map((employee) => {
              const net = employee.receiptTotal - employee.paymentTotal;
              return (
                <div key={employee.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-slate-900 sm:text-xl">{employee.name}</p>
                      <p className="mt-1 text-xs text-slate-500 sm:text-sm">{employee.transactionCount} giao dịch</p>
                    </div>
                    <div className={`rounded-2xl px-3 py-1 text-sm font-semibold ${net >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {net >= 0 ? "Dương" : "Âm"}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-700 sm:text-base">Thu</span>
                      <span className="text-sm font-bold text-emerald-700 sm:text-lg">{formatCurrency(employee.receiptTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-red-50 px-3 py-2">
                      <span className="text-sm font-medium text-red-600 sm:text-base">Chi</span>
                      <span className="text-sm font-bold text-red-600 sm:text-lg">{formatCurrency(employee.paymentTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-3 py-2 text-white">
                      <span className="text-sm font-medium sm:text-base">Chênh lệch</span>
                      <span className="text-sm font-bold sm:text-lg">{formatCurrency(net)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {employeeCashSummary.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 sm:text-base">
                Chưa có giao dịch trong khung thời gian này.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:hidden">
        {visibleTransactions.map((item) => (
          <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold uppercase tracking-wide text-slate-400">{item.code}</p>
                <p className="mt-1 text-[0.95rem] text-slate-500">{formatDate(item.createdAt)}</p>
              </div>
              <div
                className={`rounded-2xl px-3 py-1 text-sm font-semibold ${
                  item.type === "RECEIPT" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}
              >
                {item.type === "RECEIPT" ? "Thu" : "Chi"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">Đối tượng</p>
                <p className="mt-1 text-[1rem] font-semibold text-slate-800">
                  {item.customer?.name ?? item.supplier?.name ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">Liên kết</p>
                <p className="mt-1 text-[1rem] font-semibold text-slate-800">{item.order?.code ?? item.purchaseOrder?.code ?? "-"}</p>
              </div>
              {isBossAccount ? (
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Người tạo</p>
                  <p className="mt-1 text-[1rem] font-semibold text-slate-800">{item.createdBy?.name ?? "-"}</p>
                </div>
              ) : null}
              <div className={isBossAccount ? "" : "col-span-2"}>
                <p className="text-[0.85rem] font-medium text-slate-400">Số tiền</p>
                <p className={`mt-1 text-[1.15rem] font-bold ${item.type === "RECEIPT" ? "text-emerald-700" : "text-red-600"}`}>
                  {formatCurrency(Number(item.amount))}
                </p>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <CashflowEditModal
                transaction={{
                  id: item.id,
                  code: item.code,
                  type: item.type,
                  amount: Number(item.amount),
                  note: item.note,
                  orderId: item.orderId,
                  purchaseOrderId: item.purchaseOrderId,
                  customerId: item.customerId,
                  supplierId: item.supplierId,
                  orderCode: item.order?.code,
                  purchaseOrderCode: item.purchaseOrder?.code,
                  customerName: item.customer?.name,
                  supplierName: item.supplier?.name
                }}
                branchId={branchId ?? ""}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className={`text-left ${isBossAccount ? "min-w-[980px]" : "min-w-[860px]"}`}>
          <thead className="bg-slate-50 text-sm font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã phiếu</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Ngày</th>
              {isBossAccount ? <th className="px-3 py-3 sm:px-6 sm:py-4">Người tạo</th> : null}
              <th className="px-3 py-3 sm:px-6 sm:py-4">Loại</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Đối tượng</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Liên kết</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Số tiền</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 text-sm text-slate-700 sm:text-2xl">
                <td className="px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">{item.code}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{formatDate(item.createdAt)}</td>
                {isBossAccount ? <td className="px-3 py-3 sm:px-6 sm:py-4">{item.createdBy?.name ?? "-"}</td> : null}
                <td className="px-3 py-3 sm:px-6 sm:py-4">{item.type === "RECEIPT" ? "Thu" : "Chi"}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{item.customer?.name ?? item.supplier?.name ?? "-"}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{item.order?.code ?? item.purchaseOrder?.code ?? "-"}</td>
                <td className={`px-3 py-3 text-right font-semibold sm:px-6 sm:py-4 ${item.type === "RECEIPT" ? "text-emerald-600" : "text-red-500"}`}>
                  {formatCurrency(Number(item.amount))}
                </td>
                <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                  <CashflowEditModal
                    transaction={{
                      id: item.id,
                      code: item.code,
                      type: item.type,
                      amount: Number(item.amount),
                      note: item.note,
                      orderId: item.orderId,
                      purchaseOrderId: item.purchaseOrderId,
                      customerId: item.customerId,
                      supplierId: item.supplierId,
                      orderCode: item.order?.code,
                      purchaseOrderCode: item.purchaseOrder?.code,
                      customerName: item.customer?.name,
                      supplierName: item.supplier?.name
                    }}
                    branchId={branchId ?? ""}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerPagination
        pathname="/cashflow"
        query={{ range, dateFrom, dateTo }}
        page={page}
        pageSize={pageSize}
        hasNext={hasNext}
      />
    </>
  );
}

function CashflowContentFallback() {
  return (
    <div className="grid min-h-[620px] gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-h-[160px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-6 w-56 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

type CashflowPageProps = {
  searchParams?: {
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  };
};

export default async function CashflowPage({ searchParams }: CashflowPageProps) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const isBossAccount = session.role === "ADMIN";
  const canExportExcel = session.role !== "CASHIER";
  const range = ((searchParams?.range as TimeFilterRange | undefined) ?? "all") as TimeFilterRange;
  const dateFrom = searchParams?.dateFrom ?? "";
  const dateTo = searchParams?.dateTo ?? "";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 20;
  const createdAt = resolveVietnamDateRange(range, dateFrom, dateTo);

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Thu / Chi" description="Quản lý phiếu thu chi, đối tượng và công nợ liên quan" session={session} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/cashflow" className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
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
          {canExportExcel ? (
            <a
              href={`/api/cash-transactions/export?range=${encodeURIComponent(range)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg"
            >
              Xuất Excel
            </a>
          ) : null}
        </form>
        <CashflowCreateModal branchId={session.branchId ?? ""} />
      </div>

      <Suspense fallback={<CashflowContentFallback />}>
        <CashflowContent
          branchId={session.branchId ?? undefined}
          isBossAccount={isBossAccount}
          range={range}
          dateFrom={dateFrom}
          dateTo={dateTo}
          page={page}
          pageSize={pageSize}
          createdAt={createdAt ?? undefined}
        />
      </Suspense>
    </div>
  );
}
