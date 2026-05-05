import Link from "next/link";
import dynamic from "next/dynamic";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { OrderDeleteRequestActions } from "@/components/order-delete-request-actions";
import { OrdersFilterBar } from "@/components/orders-filter-bar";
import { ServerPagination } from "@/components/server-pagination";
import { OrderStatusActions } from "@/components/order-status-actions";
import { requireSession } from "@/lib/auth";
import { resolveVietnamDateRange, type TimeFilterRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { getDefaultBranchId } from "@/lib/reference-data";
import { formatCurrency, formatCustomerDebt, formatDate } from "@/lib/utils";

const OrderCreateModal = dynamic(
  () => import("@/components/order-create-modal").then((module) => module.OrderCreateModal),
  {
    ssr: false,
    loading: () => (
      <button
        disabled
        className="rounded-2xl bg-emerald-600/80 px-4 py-2.5 text-base font-semibold text-white shadow-soft sm:px-5 sm:py-3 sm:text-xl"
      >
        + Tạo HĐ
      </button>
    )
  }
);

const getCachedOrdersPageData = unstable_cache(
  async ({
    branchId,
    q,
    page,
    pageSize,
    role,
    createdAt
  }: {
    branchId?: string;
    q: string;
    page: number;
    pageSize: number;
    role: "ADMIN" | "MANAGER" | "CASHIER";
    createdAt?: Prisma.DateTimeFilter;
  }) => {
    const requestStartedAt = Date.now();
    const normalizedQuery = q.trim();
    let matchedCustomerIds: string[] = [];

    if (normalizedQuery) {
      matchedCustomerIds = (
        await prisma.customer.findMany({
          where: { name: { contains: normalizedQuery, mode: "insensitive" } },
          select: { id: true },
          take: 50
        })
      ).map((customer) => customer.id);
    }

    const orderWhere: Prisma.OrderWhereInput = {
      AND: [
        { branchId: branchId ?? undefined },
        ...(createdAt ? [{ createdAt }] : []),
        ...(role !== "ADMIN"
          ? [
              {
                OR: [
                  { deleteRequest: { is: null } },
                  { deleteRequest: { is: { status: "REJECTED" as const } } }
                ]
              }
            ]
          : []),
        ...(normalizedQuery
          ? [
              {
                OR: [
                  { code: { contains: normalizedQuery, mode: "insensitive" as const } },
                  ...(matchedCustomerIds.length > 0 ? [{ customerId: { in: matchedCustomerIds } }] : [])
                ]
              }
            ]
          : [])
      ]
    };

    const mainQueryStartedAt = Date.now();
    const orders = await prisma.order.findMany({
      where: orderWhere,
      include: {
        customer: {
          select: { id: true, name: true, receivableDebt: true }
        },
        createdBy: {
          select: { id: true, name: true }
        },
        deleteRequest: role === "ADMIN" ? {
          select: { status: true }
        } : false
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize + 1
    });
    const mainOrdersQueryMs = Date.now() - mainQueryStartedAt;

    const hasNext = orders.length > pageSize;
    const visibleOrders = hasNext ? orders.slice(0, pageSize) : orders;

    const serializationStartedAt = Date.now();
    const serializedOrders = visibleOrders.map((order) => ({
      id: order.id,
      code: order.code,
      createdAt: order.createdAt,
      grandTotal: order.grandTotal,
      customer: order.customer ?? { id: "-", name: "-", receivableDebt: 0 },
      createdBy: order.createdBy ?? null,
      deleteRequest: order.deleteRequest ?? null
    }));
    const serializationMs = Date.now() - serializationStartedAt;

    console.info("[OrdersPerformance]", {
      q: normalizedQuery,
      rowCount: serializedOrders.length,
      mainOrdersQueryMs,
      serializationMs,
      fullRequestDurationMs: Date.now() - requestStartedAt
    });

    return {
      hasNext,
      orders: serializedOrders
    };
  },
  ["orders-page-data"],
  { revalidate: 15 }
);

async function OrdersList({
  branchId,
  q,
  createdAt,
  page,
  pageSize,
  role,
  query
}: {
  branchId?: string;
  q: string;
  createdAt?: Prisma.DateTimeFilter;
  page: number;
  pageSize: number;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  query: Record<string, string | undefined>;
}) {
  const { orders, hasNext } = await getCachedOrdersPageData({
    branchId,
    q,
    page,
    pageSize,
    role,
    createdAt
  });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {orders.map((order) => (
          <div key={order.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/orders/${order.id}`}
                  prefetch={false}
                  className="text-[0.9rem] font-semibold uppercase tracking-wide text-emerald-600 underline-offset-2 hover:underline"
                >
                  {order.code}
                </Link>
                <p className="mt-1 text-[0.95rem] text-slate-500">{formatDate(order.createdAt)}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-1 text-[0.9rem] font-semibold text-emerald-700">
                {formatCurrency(Number(order.grandTotal))}
              </div>
            </div>

            <div className="mt-3">
              <Link
                href={`/orders/${order.id}`}
                prefetch={false}
                className="text-[1.15rem] font-bold leading-snug text-slate-900 underline-offset-2 hover:underline"
              >
                {order.customer.name}
              </Link>
              <p className="mt-1 text-[0.92rem] text-slate-500">Lập bởi: {order.createdBy?.name ?? "Không rõ"}</p>
              <p className="mt-1 text-[0.92rem] font-semibold text-red-600">
                Công nợ KH: {formatCustomerDebt(Number(order.customer.receivableDebt))}
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
                  <Link href={`/orders/${order.id}`} prefetch={false} className="underline-offset-2 hover:underline">
                    {order.code}
                  </Link>
                </td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{formatDate(order.createdAt)}</td>
                <td className="px-3 py-3 font-medium text-slate-900 sm:px-6 sm:py-4">
                  <Link href={`/orders/${order.id}`} prefetch={false} className="underline-offset-2 hover:underline">
                    {order.customer.name}
                  </Link>
                </td>
                <td className={`px-3 py-3 text-right font-semibold sm:px-6 sm:py-4 ${Number(order.customer.receivableDebt) > 0 ? "text-red-600" : Number(order.customer.receivableDebt) < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                  {formatCustomerDebt(Number(order.customer.receivableDebt))}
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
      <ServerPagination pathname="/orders" query={query} page={page} pageSize={pageSize} hasNext={hasNext} />
    </>
  );
}

function OrdersListFallback() {
  return (
    <div className="grid min-h-[620px] gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="min-h-[144px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
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

async function PendingDeleteRequestsSection({
  branchId,
  createdAt
}: {
  branchId: string | null;
  createdAt?: Prisma.DateTimeFilter;
}) {
  const startedAt = Date.now();
  const pendingDeleteRequests = await prisma.orderDeleteRequest.findMany({
    where: {
      status: "PENDING",
      order: {
        branchId: branchId ?? undefined,
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
  });
  console.info("[OrdersPerformance]", {
    section: "pendingDeleteRequests",
    rowCount: pendingDeleteRequests.length,
    fullRequestDurationMs: Date.now() - startedAt
  });

  if (pendingDeleteRequests.length === 0) return null;

  return (
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
                <Link
                  href={`/orders/${request.order.id}`}
                  prefetch={false}
                  className="text-base font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-xl"
                >
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
  );
}

function PendingDeleteRequestsFallback() {
  return (
    <section className="min-h-[96px] rounded-3xl border border-amber-200 bg-amber-50/50 p-4 shadow-soft sm:p-6">
      <div className="h-6 w-56 animate-pulse rounded bg-amber-100" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-amber-100" />
    </section>
  );
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams?: { q?: string; range?: string; dateFrom?: string; dateTo?: string; page?: string };
}) {
  const startedAt = Date.now();
  const authStartedAt = Date.now();
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const authSessionCheckMs = Date.now() - authStartedAt;
  const canExportExcel = session.role !== "CASHIER";
  const isAdmin = session.role === "ADMIN";
  const q = searchParams?.q ?? "";
  const range = (searchParams?.range as TimeFilterRange) || "all";
  const dateFrom = searchParams?.dateFrom ?? "";
  const dateTo = searchParams?.dateTo ?? "";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 20;
  const createdAt = resolveVietnamDateRange(range, dateFrom, dateTo);
  const branchLookupStartedAt = Date.now();
  const branchId = session.branchId ?? (await getDefaultBranchId()) ?? "";
  const branchLookupMs = Date.now() - branchLookupStartedAt;
  console.info("[OrdersPerformance]", {
    phase: "page-shell",
    authSessionCheckMs,
    branchLookupMs,
    fullRequestDurationMs: Date.now() - startedAt
  });

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Hóa đơn" description="Quản lý hóa đơn bán hàng" session={session} />

      <div className="flex min-h-[56px] flex-col gap-3 lg:min-h-[64px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <OrdersFilterBar q={q} range={range} dateFrom={dateFrom} dateTo={dateTo} canExport={canExportExcel} />
        <OrderCreateModal branchId={branchId} />
      </div>

      {isAdmin ? (
        <Suspense fallback={<PendingDeleteRequestsFallback />}>
          <PendingDeleteRequestsSection branchId={session.branchId} createdAt={createdAt} />
        </Suspense>
      ) : null}

      <Suspense fallback={<OrdersListFallback />}>
        <OrdersList
          branchId={session.branchId ?? undefined}
          q={q}
          createdAt={createdAt}
          page={page}
          pageSize={pageSize}
          role={session.role}
          query={{ q, range, dateFrom, dateTo }}
        />
      </Suspense>
    </div>
  );
}
