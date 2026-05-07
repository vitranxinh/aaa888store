import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { AutocompleteSearchInput } from "@/components/autocomplete-search-input";
import { CustomerCreateForm } from "@/components/customer-create-form";
import { CustomerEditModal } from "@/components/customer-edit-modal";
import { ServerPagination } from "@/components/server-pagination";
import { requireSession } from "@/lib/auth";
import { getAllCustomers } from "@/lib/customer-debt";
import { getCustomerGroupOptions } from "@/lib/reference-data";
import { formatCurrency, formatDate } from "@/lib/utils";

function displayCustomerPhone(phone: string | null) {
  return phone?.startsWith("AUTO_PHONE_") ? "" : phone ?? "";
}

function renderBalanceLabel(balance: number) {
  if (balance > 0) return formatCurrency(balance);
  if (balance < 0) return `Khách trả trước / trả dư ${formatCurrency(Math.abs(balance))}`;
  return "Không có công nợ";
}

async function CustomerDebtList({
  q,
  sort,
  page,
  pageSize,
  canManageCustomers,
  canSeeCustomerPrivateFields,
  groupOptions
}: {
  q: string;
  sort: "default" | "debt_desc" | "debt_asc";
  page: number;
  pageSize: number;
  canManageCustomers: boolean;
  canSeeCustomerPrivateFields: boolean;
  groupOptions: { id: string; name: string }[];
}) {
  const { rows, hasNext } = await getAllCustomers({
    q,
    page,
    pageSize,
    sort
  });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {rows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-soft">
            Hiện chưa có khách hàng nào.
          </div>
        ) : (
          rows.map((customer) => (
            <div key={customer.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-semibold uppercase tracking-wide text-slate-400">{customer.code}</p>
                  <Link prefetch={false} href={`/customers/${customer.id}`} className="mt-1 block text-[1.2rem] font-bold leading-snug text-slate-900 underline-offset-2 hover:underline">
                    {customer.name}
                  </Link>
                </div>
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
                      openingDebt: customer.openingDebt,
                      currentDebt: customer.receivableDebt
                    }}
                    groups={groupOptions}
                  />
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Công nợ hiện tại</p>
                  <p
                    className={`mt-1 text-[1.15rem] font-bold ${
                      customer.receivableDebt > 0
                        ? "text-red-600"
                        : customer.receivableDebt < 0
                          ? "text-emerald-600"
                          : "text-slate-700"
                    }`}
                  >
                    {renderBalanceLabel(customer.receivableDebt)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Hóa đơn còn nợ</p>
                  <p className="mt-1 text-[1rem] font-semibold text-slate-800">{customer.unpaidInvoiceCount}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-[0.95rem] text-slate-600">
                <p>
                  <span className="font-medium text-slate-500">{canSeeCustomerPrivateFields ? "SĐT" : "Thông tin"}:</span>{" "}
                  {canSeeCustomerPrivateFields ? displayCustomerPhone(customer.phone) || "-" : "Đã ẩn với nhân viên"}
                </p>
                <p>
                  <span className="font-medium text-slate-500">Hóa đơn gần nhất:</span>{" "}
                  {customer.lastInvoiceDate ? formatDate(customer.lastInvoiceDate) : "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-500">Phiếu thu gần nhất:</span>{" "}
                  {customer.lastReceiptDate ? formatDate(customer.lastReceiptDate) : "-"}
                </p>
              </div>

              <div className="mt-3">
                <Link
                  prefetch={false}
                  href={`/customers/${customer.id}`}
                  className="inline-flex items-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                >
                  Xem chi tiết công nợ
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className={`w-full table-fixed text-left ${canSeeCustomerPrivateFields ? "min-w-[1120px]" : "min-w-[980px]"}`}>
          <thead className="bg-slate-50 text-[15px] font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="w-[20%] px-3 py-3 sm:px-6 sm:py-4">Khách hàng</th>
              {canSeeCustomerPrivateFields ? <th className="w-[14%] px-3 py-3 sm:px-6 sm:py-4">SĐT</th> : null}
              <th className="w-[14%] px-3 py-3 text-right text-red-600 sm:px-6 sm:py-4">Công nợ hiện tại</th>
              <th className="w-[14%] px-3 py-3 text-center sm:px-6 sm:py-4">Hóa đơn còn nợ</th>
              <th className="w-[16%] px-3 py-3 sm:px-6 sm:py-4">Hóa đơn gần nhất</th>
              <th className="w-[16%] px-3 py-3 sm:px-6 sm:py-4">Phiếu thu gần nhất</th>
              <th className="w-[10%] px-3 py-3 sm:px-6 sm:py-4">Chi tiết</th>
              {canManageCustomers ? <th className="w-[10%] px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManageCustomers ? (canSeeCustomerPrivateFields ? 8 : 7) : canSeeCustomerPrivateFields ? 7 : 6} className="px-3 py-10 text-center text-sm text-slate-400 sm:px-6 sm:py-12 sm:text-2xl">
                  Hiện chưa có khách hàng nào.
                </td>
              </tr>
            ) : (
              rows.map((customer) => (
                <tr key={customer.id} className="border-t border-slate-100 align-top text-[15px] text-slate-700 sm:text-2xl">
                  <td className="break-words px-3 py-3 sm:px-6 sm:py-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">{customer.code}</p>
                    <Link prefetch={false} href={`/customers/${customer.id}`} className="mt-1 block font-semibold text-slate-900 underline-offset-2 hover:underline">
                      {customer.name}
                    </Link>
                  </td>
                  {canSeeCustomerPrivateFields ? <td className="break-words px-3 py-3 sm:px-6 sm:py-4">{displayCustomerPhone(customer.phone) || "-"}</td> : null}
                  <td
                    className={`whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-6 sm:py-4 ${
                      customer.receivableDebt > 0
                        ? "text-red-600"
                        : customer.receivableDebt < 0
                          ? "text-emerald-600"
                          : "text-slate-700"
                    }`}
                  >
                    {renderBalanceLabel(customer.receivableDebt)}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-900 sm:px-6 sm:py-4">{customer.unpaidInvoiceCount}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{customer.lastInvoiceDate ? formatDate(customer.lastInvoiceDate) : "-"}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{customer.lastReceiptDate ? formatDate(customer.lastReceiptDate) : "-"}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <Link
                      prefetch={false}
                      href={`/customers/${customer.id}`}
                      className="inline-flex max-w-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-semibold leading-snug text-red-700"
                    >
                      Xem chi tiết công nợ
                    </Link>
                  </td>
                  {canManageCustomers ? (
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
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
                          openingDebt: customer.openingDebt,
                          currentDebt: customer.receivableDebt
                        }}
                        groups={groupOptions}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServerPagination pathname="/customers" query={{ q, debt: sort }} page={page} pageSize={pageSize} hasNext={hasNext} />
    </>
  );
}

function CustomerDebtListFallback() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-6 w-56 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-20 animate-pulse rounded-2xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export default async function CustomersPage({
  searchParams
}: {
  searchParams?: { q?: string; debt?: string; page?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canCreateCustomers = true;
  const canManageCustomers = session.role !== "CASHIER";
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";
  const q = searchParams?.q ?? "";
  const sort = ((searchParams?.debt ?? "default") as "default" | "debt_desc" | "debt_asc");
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 20;

  const groups = await getCustomerGroupOptions();
  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Khách hàng" description="Công nợ hiện tại chỉ tính từ hóa đơn còn nợ và phiếu thu của khách" session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <AutocompleteSearchInput
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, SĐT..."
            suggestions={[]}
            fetchUrl="/api/customers/search?limit=20"
            autoSubmitDelayMs={300}
            className="sm:min-w-[280px]"
          />
          <select
            name="debt"
            defaultValue={sort}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:text-lg"
          >
            <option value="default">Mặc định</option>
            <option value="debt_desc">Nợ cao đến thấp</option>
            <option value="debt_asc">Nợ thấp đến cao</option>
          </select>
          <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg">
            Lọc
          </button>
        </form>
        {canCreateCustomers ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-soft sm:px-6 sm:py-4 sm:text-2xl">
                + Thêm KH
              </summary>
              <div className="absolute right-0 top-16 z-20 w-[92vw] max-w-[460px] sm:top-20">
                <CustomerCreateForm groups={groupOptions} />
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <Suspense fallback={<CustomerDebtListFallback />}>
        <CustomerDebtList
          q={q}
          sort={sort}
          page={page}
          pageSize={pageSize}
          canManageCustomers={canManageCustomers}
          canSeeCustomerPrivateFields={canSeeCustomerPrivateFields}
          groupOptions={groupOptions}
        />
      </Suspense>
    </div>
  );
}
