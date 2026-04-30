import { AppHeader } from "@/components/app-header";
import { ProductCreateForm } from "@/components/product-create-form";
import { ProductEditModal } from "@/components/product-edit-modal";
import { ProductImportModal } from "@/components/product-import-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function ProductsPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageProducts = session.role === "ADMIN" || session.role === "MANAGER";
  const canDeleteProducts = session.role === "ADMIN";
  const q = searchParams?.q ?? "";

  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { category: { name: { contains: q, mode: "insensitive" } } }
            ]
          }
        : undefined,
      include: { category: true, inventories: true },
      orderBy: { sku: "asc" },
      take: 100
    }),
    prisma.category.findMany(),
    prisma.brand.findMany()
  ]);
  const categoryOptions = categories.map((item) => ({ id: item.id, name: item.name }));
  const brandOptions = brands.map((item) => ({ id: item.id, name: item.name }));

  return (
    <div className="space-y-8">
      <AppHeader title="Hàng hóa" description={`${products.length} sản phẩm`} session={session} />

      <div className="flex items-center justify-between gap-4">
        <form className="w-full max-w-xl">
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, nhóm hàng..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-2xl shadow-soft outline-none"
          />
        </form>
        {canManageProducts ? (
          <div className="flex items-center gap-3">
            <ProductImportModal branchId={session.branchId ?? ""} />
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-6 py-4 text-2xl font-semibold text-white shadow-soft">
                + Thêm SP
              </summary>
              <div className="absolute right-0 top-20 z-20 w-[500px]">
                <ProductCreateForm categories={categoryOptions} brands={brandOptions} />
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xl font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-4">Ảnh</th>
              <th className="px-6 py-4">Mã SP</th>
              <th className="px-6 py-4">Tên sản phẩm</th>
              <th className="px-6 py-4">Nhóm</th>
              <th className="px-6 py-4">Barcode</th>
              <th className="px-6 py-4 text-right">Giá bán</th>
              <th className="px-6 py-4 text-right">Tồn kho</th>
              <th className="px-6 py-4 text-right">Cảnh báo</th>
              {canManageProducts ? <th className="px-6 py-4 text-right">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const totalQuantity = product.inventories.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <tr key={product.id} className="border-t border-slate-100 text-2xl text-slate-700">
                  <td className="px-6 py-4">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-xl object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-slate-100" />
                    )}
                  </td>
                  <td className="px-6 py-4">{product.sku}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{product.name}</td>
                  <td className="px-6 py-4">{product.category?.name ?? "-"}</td>
                  <td className="px-6 py-4">{product.barcode ?? "-"}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(Number(product.sellingPrice))}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${totalQuantity <= product.lowStockAlert ? "text-red-500" : "text-slate-900"}`}>
                    {totalQuantity}
                  </td>
                  <td className="px-6 py-4 text-right">{product.lowStockAlert}</td>
                  {canManageProducts ? (
                    <td className="px-6 py-4 text-right">
                      <ProductEditModal
                        product={{
                          id: product.id,
                          name: product.name,
                          sku: product.sku,
                          barcode: product.barcode,
                          imageUrl: product.imageUrl,
                          categoryId: product.categoryId,
                          brandId: product.brandId,
                          costPrice: Number(product.costPrice),
                          sellingPrice: Number(product.sellingPrice),
                          lowStockAlert: product.lowStockAlert,
                          status: product.status,
                          description: product.description
                        }}
                        categories={categoryOptions}
                        brands={brandOptions}
                        canDelete={canDeleteProducts}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
