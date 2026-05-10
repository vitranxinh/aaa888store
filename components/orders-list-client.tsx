"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OrderStatusActions } from "@/components/order-status-actions";
import { ServerPagination } from "@/components/server-pagination";
import { formatCurrency, formatCustomerDebt, formatDate } from "@/lib/utils";

type OrderRow = {
  id: string;
  code: string;
  createdAt: Date | string;
  grandTotal: number | string;
  customer: {
    id: string;
    name: string;
    receivableDebt: number | string;
  };
  createdBy: {
    name: string;
  } | null;
  deleteRequest: {
    status: "PENDING" | "REJECTED";
  } | null;
};

type Props = {
  initialOrders: OrderRow[];
  role: "ADMIN" | "MANAGER" | "CASHIER";
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

export function OrdersListClient({ initialOrders, role, query, page, pageSize, hasNext }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<string[]>([]);

  const visibleOrders = orders.filter((order) => !optimisticallyRemovedIds.includes(order.id));

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {visibleOrders.map((order) => (
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
                orderCode={order.code}
                onOptimisticRemove={() => {
                  setOptimisticallyRemovedIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
                }}
                onOptimisticRollback={() => {
                  setOptimisticallyRemovedIds((prev) => prev.filter((id) => id !== order.id));
                }}
                onServerSuccess={(payload) => {
                  if (payload.mode === "requested") {
                    setOrders((prev) =>
                      prev.map((item) =>
                        item.id === order.id
                          ? {
                              ...item,
                              deleteRequest: { status: "PENDING" }
                            }
                          : item
                      )
                    );
                  } else {
                    router.refresh();
                  }
                }}
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
            {visibleOrders.map((order) => (
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
                      orderCode={order.code}
                      onOptimisticRemove={() => {
                        setOptimisticallyRemovedIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
                      }}
                      onOptimisticRollback={() => {
                        setOptimisticallyRemovedIds((prev) => prev.filter((id) => id !== order.id));
                      }}
                      onServerSuccess={(payload) => {
                        if (payload.mode === "requested") {
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id
                                ? {
                                    ...item,
                                    deleteRequest: { status: "PENDING" }
                                  }
                                : item
                            )
                          );
                        } else {
                          router.refresh();
                        }
                      }}
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
