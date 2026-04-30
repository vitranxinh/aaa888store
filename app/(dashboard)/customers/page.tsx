import { AppHeader } from "@/components/app-header";
import { CustomerCreateForm } from "@/components/customer-create-form";
import { CustomerImportModal } from "@/components/customer-import-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function CustomersPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageCustomers = session.role === "ADMIN" || session.role === "MANAGER";
  const q = searchParams?.q ?? "";
  const [customers, groups] = await Promise.all([
    prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } }
            ]
          }
        : undefined,
      orderBy: { code: "desc" },
      take: 50
    }),
    prisma.customerGroup.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <div className="space-y-8">
      <AppHeader title="Khách hàng" description={`${customers.length} khách hàng`} session={session} />

      <div className="flex items-center justify-between gap-4">
        <form className="w-full max-w-xl">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, SĐT..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-2xl shadow-soft outline-none"
          />
        </form>
        {canManageCustomers ? (
          <div className="flex items-center gap-3">
            <CustomerImportModal />
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-6 py-4 text-2xl font-semibold text-white shadow-soft">
                + Thêm KH
              </summary>
              <div className="absolute right-0 top-20 z-20 w-[460px]">
                <CustomerCreateForm groups={groups.map((group) => ({ id: group.id, name: group.name }))} />
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xl font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-4">Mã KH</th>
              <th className="px-6 py-4">Tên</th>
              <th className="px-6 py-4">SĐT</th>
              <th className="px-6 py-4">Địa chỉ</th>
              <th className="px-6 py-4 text-right">Công nợ</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100 text-2xl text-slate-700">
                <td className="px-6 py-4">{customer.code}</td>
                <td className="px-6 py-4 font-semibold text-slate-900">{customer.name}</td>
                <td className="px-6 py-4">{customer.phone}</td>
                <td className="px-6 py-4">{customer.address || "-"}</td>
                <td className="px-6 py-4 text-right font-semibold text-emerald-600">
                  {formatCurrency(Number(customer.openingDebt) + Number(customer.receivableDebt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
