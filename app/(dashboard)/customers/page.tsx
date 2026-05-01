import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { AutocompleteSearchInput } from "@/components/autocomplete-search-input";
import { CustomerCreateForm } from "@/components/customer-create-form";
import { CustomerEditModal } from "@/components/customer-edit-modal";
import { ServerPagination } from "@/components/server-pagination";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCustomerGroupOptions } from "@/lib/reference-data";
import { formatCurrency } from "@/lib/utils";

async function CustomersList({
  q,
  debtFilter,
  page,
  pageSize,
  canManageCustomers,
  canSeeCustomerPrivateFields,
  groupOptions
}: {
  q: string;
  debtFilter: string;
  page: number;
  pageSize: number;
  canManageCustomers: boolean;
  canSeeCustomerPrivateFields: boolean;
  groupOptions: { id: string; name: string }[];
}) {
  const customerWhere = {
    NOT: { code: "KH000000" },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const customers = await prisma.customer.findMany({
    where: customerWhere,
    orderBy: { code: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize
  });

  const filteredCustomers = customers
    .map((customer) => ({
      ...customer,
      totalDebt: Number(customer.receivableDebt)
    }))
    .filter((customer) => (debtFilter === "has_debt" ? customer.totalDebt > 0 : true))
    .sort((a, b) => {
      if (debtFilter === "debt_desc") return b.totalDebt - a.totalDebt;
      if (debtFilter === "debt_asc") return a.totalDebt - b.totalDebt;
      return 0;
    });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {filteredCustomers.map((customer) => (
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

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">{canSeeCustomerPrivateFields ? "Số điện thoại" : "Thông tin"}</p>
                <p className="mt-1 text-[1rem] font-semibold text-slate-800">{canSeeCustomerPrivateFields ? customer.phone || "-" : "Đã ẩn với nhân viên"}</p>
              </div>
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">Công nợ</p>
                <p className="mt-1 text-[1.15rem] font-bold text-red-600">{formatCurrency(customer.totalDebt)}</p>
              </div>
            </div>

            {canSeeCustomerPrivateFields ? (
              <div className="mt-3">
                <p className="text-[0.85rem] font-medium text-slate-400">Địa chỉ</p>
                <p className="mt-1 text-[1rem] leading-relaxed text-slate-700">{customer.address || "-"}</p>
              </div>
            ) : null}

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
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table
          className={`w-full table-fixed text-left ${
            canSeeCustomerPrivateFields ? "min-w-[980px]" : "min-w-[840px]"
          }`}
        >
          <thead className="bg-slate-50 text-[15px] font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="w-[16%] px-3 py-3 sm:px-6 sm:py-4">Mã KH</th>
              <th className={`${canSeeCustomerPrivateFields ? "w-[20%]" : "w-[28%]"} px-3 py-3 sm:px-6 sm:py-4`}>Tên</th>
              {canSeeCustomerPrivateFields ? <th className="w-[17%] px-3 py-3 sm:px-6 sm:py-4">SĐT</th> : null}
              {canSeeCustomerPrivateFields ? <th className="w-[23%] px-3 py-3 sm:px-6 sm:py-4">Địa chỉ</th> : null}
              <th className="w-[12%] px-3 py-3 text-right text-red-600 sm:px-6 sm:py-4">Công nợ</th>
              <th className="w-[12%] px-3 py-3 sm:px-6 sm:py-4">Chi tiết</th>
              {canManageCustomers ? <th className="w-[12%] px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100 align-top text-[15px] text-slate-700 sm:text-2xl">
                <td className="break-words px-3 py-3 sm:px-6 sm:py-4">{customer.code}</td>
                <td className="break-words px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">
                  <Link prefetch={false} href={`/customers/${customer.id}`} className="underline-offset-2 hover:underline">
                    {customer.name}
                  </Link>
                </td>
                {canSeeCustomerPrivateFields ? <td className="break-words px-3 py-3 sm:px-6 sm:py-4">{customer.phone}</td> : null}
                {canSeeCustomerPrivateFields ? <td className="break-words px-3 py-3 sm:px-6 sm:py-4">{customer.address || "-"}</td> : null}
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-red-600 sm:px-6 sm:py-4">
                  {formatCurrency(customer.totalDebt)}
                </td>
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
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CustomersListFallback() {
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
  const debtFilter = searchParams?.debt ?? "default";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 10;

  const customerWhere = {
    NOT: { code: "KH000000" },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [customerCount, groups] = await Promise.all([
    prisma.customer.count({ where: customerWhere }),
    getCustomerGroupOptions()
  ]);

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Khách hàng" description={`${customerCount} khách hàng`} session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <AutocompleteSearchInput
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, SĐT..."
            suggestions={[]}
            fetchUrl="/api/customers/search?limit=20"
            className="sm:min-w-[280px]"
          />
          <select
            name="debt"
            defaultValue={debtFilter}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:text-lg"
          >
            <option value="default">Mặc định</option>
            <option value="debt_desc">Nợ cao đến thấp</option>
            <option value="debt_asc">Nợ thấp đến cao</option>
            <option value="has_debt">Chỉ khách còn nợ</option>
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

      <Suspense fallback={<CustomersListFallback />}>
        <CustomersList
          q={q}
          debtFilter={debtFilter}
          page={page}
          pageSize={pageSize}
          canManageCustomers={canManageCustomers}
          canSeeCustomerPrivateFields={canSeeCustomerPrivateFields}
          groupOptions={groupOptions}
        />
      </Suspense>
      <ServerPagination
        pathname="/customers"
        query={{ q, debt: debtFilter }}
        page={page}
        pageSize={pageSize}
        totalCount={customerCount}
      />
    </div>
  );
}
