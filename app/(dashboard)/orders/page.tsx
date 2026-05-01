import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { OrderDeleteRequestActions } from "@/components/order-delete-request-actions";
import { OrderCreateModal } from "@/components/order-create-modal";
import { OrdersFilterBar } from "@/components/orders-filter-bar";
import { ServerPagination } from "@/components/server-pagination";
import { OrderStatusActions } from "@/components/order-status-actions";
import { requireSession } from "@/lib/auth";
import { resolveVietnamDateRange, type TimeFilterRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { getDefaultBranchId } from "@/lib/reference-data";
import { formatCurrency, formatDate } from "@/lib/utils";

async function OrdersList({
  orderWhere,
  page,
  pageSize,
  role
}: {
  orderWhere: Prisma.OrderWhereInput;
  page: number;
  pageSize: number;
  role: "ADMIN" | "MANAGER" | "CASHIER";
}) {
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      customer: true,
      createdBy: { select: { name: true } },
      deleteRequest: { select: { id: true, status: true } }
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize
  });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {orders.map((order) => (
          <div key={order.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/orders/${order.id}`} className="text-[0.9rem] font-semibold uppercase tracking-wide text-emerald-600 underline-offset-2 hover:underline">
                  {order.code}
                </Link>
                <p className="mt-1 text-[0.95rem] text-slate-500">{formatDate(order.createdAt)}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-1 text-[0.9rem] font-semibold text-emerald-700">
                {formatCurrency(Number(order.grandTotal))}
              </div>
            </div>

            <div className="mt-3">
              <Link href={`/orders/${order.id}`} className="text-[1.15rem] font-bold leading-snug text-slate-900 underline-offset-2 hover:underline">
                {order.customer.name}
              </Link>
              <p className="mt-1 text-[0.92rem] text-slate-500">Lập bởi: {order.createdBy?.name ?? "Không rõ"}</p>
              <p className="mt-1 text-[0.92rem] font-semibold text-red-600">
                Khách còn nợ: {formatCurrency(Number(order.customer.receivableDebt))}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <OrderStatusActions
                id={order.id}
                role={role}
                hasPendingDeleteRequest={order.deleteRequest?.status === "PENDING"}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className="min-w-[920px] text-left">
          <thead className="bg-slate-50 text-sm font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã HĐ</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Ngày</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Khách hàng</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Công nợ KH</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Người tạo</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Tổng tiền</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-100 text-sm text-slate-700 sm:text-2xl">
                <td className="px-3 py-3 font-semibold text-emerald-600 sm:px-6 sm:py-4">
                  <Link href={`/orders/${order.id}`} className="underline-offset-2 hover:underline">
                    {order.code}
                  </Link>
                </td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{formatDate(order.createdAt)}</td>
                <td className="px-3 py-3 font-medium text-slate-900 sm:px-6 sm:py-4">
                  <Link href={`/orders/${order.id}`} className="underline-offset-2 hover:underline">
                    {order.customer.name}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right font-semibold text-red-600 sm:px-6 sm:py-4">
                  {formatCurrency(Number(order.customer.receivableDebt))}
                </td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{order.createdBy?.name ?? "-"}</td>
                <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(Number(order.grandTotal))}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">
                  <div className="flex flex-wrap gap-2">
                    <OrderStatusActions
                      id={order.id}
                      role={role}
                      hasPendingDeleteRequest={order.deleteRequest?.status === "PENDING"}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrdersListFallback() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-4 w-20 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
          <div className="mt-4 h-6 w-48 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-10 animate-pulse rounded-2xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams?: { q?: string; range?: string; dateFrom?: string; dateTo?: string; page?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canExportExcel = session.role !== "CASHIER";
  const isAdmin = session.role === "ADMIN";
  const q = searchParams?.q ?? "";
  const range = (searchParams?.range as TimeFilterRange) || "all";
  const dateFrom = searchParams?.dateFrom ?? "";
  const dateTo = searchParams?.dateTo ?? "";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 20;
  const createdAt = resolveVietnamDateRange(range, dateFrom, dateTo);

  const orderWhere: Prisma.OrderWhereInput = {
    AND: [
      { branchId: session.branchId ?? undefined },
      ...(createdAt ? [{ createdAt }] : []),
      ...(!isAdmin
        ? [
            {
              OR: [
                { deleteRequest: { is: null } },
                { deleteRequest: { is: { status: "REJECTED" as const } } }
              ]
            }
          ]
        : []),
      ...(q
        ? [
            {
              OR: [
                { code: { contains: q, mode: "insensitive" as const } },
                { customer: { name: { contains: q, mode: "insensitive" as const } } }
              ]
            }
          ]
        : [])
    ]
  };

  const [orderCount, customers, defaultBranchId, pendingDeleteRequests] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.customer.findMany({ select: { id: true, name: true, code: true }, orderBy: { code: "desc" }, take: 120 }),
    getDefaultBranchId(),
    isAdmin
      ? prisma.orderDeleteRequest.findMany({
          where: {
            status: "PENDING",
            order: {
              branchId: session.branchId ?? undefined,
              ...(createdAt ? { createdAt } : {})
            }
          },
          include: {
            order: {
              select: {
                id: true,
                code: true,
                grandTotal: true,
                createdAt: true,
                customer: { select: { name: true } }
              }
            },
            requestedBy: {
              select: { name: true, email: true }
            }
          },
          orderBy: { createdAt: "desc" }
    })
      : Promise.resolve([])
  ]);
  customers.sort((a, b) => {
    if (a.code === "KH000000") return -1;
    if (b.code === "KH000000") return 1;
    return a.code.localeCompare(b.code);
  });

  const branchId = session.branchId ?? defaultBranchId ?? "";

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Hóa đơn" description={`${orderCount} hóa đơn`} session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <OrdersFilterBar q={q} range={range} dateFrom={dateFrom} dateTo={dateTo} canExport={canExportExcel} />
        <OrderCreateModal
          branchId={branchId}
          customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
        />
      </div>

      {isAdmin && pendingDeleteRequests.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-2xl">Yêu cầu xóa hóa đơn</h2>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">
                Nhân viên đã gửi {pendingDeleteRequests.length} yêu cầu chờ sếp duyệt.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {pendingDeleteRequests.map((request) => (
              <div key={request.id} className="rounded-3xl border border-amber-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <Link href={`/orders/${request.order.id}`} className="text-base font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-xl">
                      {request.order.code}
                    </Link>
                    <p className="text-sm text-slate-600 sm:text-base">Khách hàng: {request.order.customer.name}</p>
                    <p className="text-sm text-slate-600 sm:text-base">
                      Nhân viên yêu cầu: <span className="font-semibold">{request.requestedBy.name}</span>
                    </p>
                    <p className="text-xs text-slate-500 sm:text-sm">
                      {formatDate(request.createdAt)} · {formatCurrency(Number(request.order.grandTotal))}
                    </p>
                  </div>
                  <OrderDeleteRequestActions requestId={request.id} orderCode={request.order.code} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Suspense fallback={<OrdersListFallback />}>
        <OrdersList orderWhere={orderWhere} page={page} pageSize={pageSize} role={session.role} />
      </Suspense>
      <ServerPagination
        pathname="/orders"
        query={{ q, range, dateFrom, dateTo }}
        page={page}
        pageSize={pageSize}
        totalCount={orderCount}
      />
    </div>
  );
}
