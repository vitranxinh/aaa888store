import { AppHeader } from "@/components/app-header";
import { SupplierCreateForm } from "@/components/supplier-create-form";
import { SupplierEditModal } from "@/components/supplier-edit-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function SuppliersPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageSuppliers = true;
  const q = searchParams?.q ?? "";

  const supplierWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [suppliers, supplierCount] = await Promise.all([
    prisma.supplier.findMany({
      where: supplierWhere,
      orderBy: { code: "desc" },
      take: 50
    }),
    prisma.supplier.count({ where: supplierWhere })
  ]);

  const purchaseDebtBySupplier = suppliers.length
    ? await prisma.purchaseOrder.groupBy({
        by: ["supplierId"],
        where: {
          supplierId: { in: suppliers.map((supplier) => supplier.id) },
          status: { in: ["COMPLETED", "PARTIAL"] }
        },
        _sum: { debtAmount: true }
      })
    : [];

  const purchaseDebtMap = new Map(
    purchaseDebtBySupplier.map((item) => [item.supplierId, Number(item._sum.debtAmount ?? 0)])
  );

  const supplierRows = suppliers.map((supplier) => ({
    ...supplier,
    totalDebt: Number(supplier.openingDebt) + (purchaseDebtMap.get(supplier.id) ?? 0)
  }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Nhà cung cấp" description={`${supplierCount} nhà cung cấp`} session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="w-full max-w-xl">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, SĐT..."
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base shadow-soft outline-none sm:h-14 sm:px-5 sm:text-xl"
          />
        </form>
        {canManageSuppliers ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-soft sm:px-6 sm:py-4 sm:text-2xl">
              + Thêm NCC
            </summary>
            <div className="absolute right-0 top-16 z-20 w-[92vw] max-w-[460px] sm:top-20">
              <SupplierCreateForm />
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid gap-3 sm:hidden">
        {supplierRows.map((supplier) => (
          <div key={supplier.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{supplier.code}</p>
                <p className="mt-1 text-[1.15rem] font-bold leading-snug text-slate-900">{supplier.name}</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-3 py-2 text-right">
                <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-red-500">Công nợ</p>
                <p className="mt-1 text-[1.05rem] font-bold text-red-600">{formatCurrency(supplier.totalDebt)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[0.85rem] font-medium text-slate-400">Số điện thoại</span>
                <span className="text-[0.98rem] font-semibold text-slate-800">{supplier.phone || "-"}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="text-[0.85rem] font-medium text-slate-400">Địa chỉ</p>
                <p className="mt-1 text-[0.98rem] leading-relaxed text-slate-700">{supplier.address || "-"}</p>
              </div>
              {supplier.note ? (
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-[0.85rem] font-medium text-slate-400">Ghi chú</p>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-slate-700">{supplier.note}</p>
                </div>
              ) : null}
            </div>

            {canManageSuppliers ? (
              <div className="mt-4 flex justify-end">
                <SupplierEditModal
                  supplier={{
                    id: supplier.id,
                    code: supplier.code,
                    name: supplier.name,
                    phone: supplier.phone,
                    address: supplier.address,
                    note: supplier.note,
                    openingDebt: Number(supplier.openingDebt)
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className="min-w-[760px] text-left">
          <thead className="bg-slate-50 text-sm font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã NCC</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Tên</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">SĐT</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Địa chỉ</th>
              <th className="px-3 py-3 text-right text-red-600 sm:px-6 sm:py-4">Công nợ</th>
              {canManageSuppliers ? <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {supplierRows.map((supplier) => (
              <tr key={supplier.id} className="border-t border-slate-100 text-sm text-slate-700 sm:text-2xl">
                <td className="px-3 py-3 sm:px-6 sm:py-4">{supplier.code}</td>
                <td className="px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">{supplier.name}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{supplier.phone || "-"}</td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">{supplier.address || "-"}</td>
                <td className="px-3 py-3 text-right font-semibold text-red-600 sm:px-6 sm:py-4">
                  {formatCurrency(supplier.totalDebt)}
                </td>
                {canManageSuppliers ? (
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                    <SupplierEditModal
                      supplier={{
                        id: supplier.id,
                        code: supplier.code,
                        name: supplier.name,
                        phone: supplier.phone,
                        address: supplier.address,
                        note: supplier.note,
                        openingDebt: Number(supplier.openingDebt)
                      }}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
