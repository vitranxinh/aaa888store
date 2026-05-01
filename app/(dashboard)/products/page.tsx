import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { AutocompleteSearchInput } from "@/components/autocomplete-search-input";
import { ProductCreateForm } from "@/components/product-create-form";
import { ProductEditModal } from "@/components/product-edit-modal";
import { ProductStockAdjustModal } from "@/components/product-stock-adjust-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

async function ProductsList({
  q,
  branchId,
  canEditProducts,
  canDeleteProducts,
  canAdjustInventory,
  categoryOptions,
  brandOptions
}: {
  q: string;
  branchId: string;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canAdjustInventory: boolean;
  categoryOptions: { id: string; name: string }[];
  brandOptions: { id: string; name: string }[];
}) {
  const productWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { sku: { contains: q, mode: "insensitive" as const } },
          { barcode: { contains: q, mode: "insensitive" as const } },
          { category: { name: { contains: q, mode: "insensitive" as const } } }
        ]
      }
    : undefined;

  const products = await prisma.product.findMany({
    where: productWhere,
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      imageUrl: true,
      categoryId: true,
      brandId: true,
      costPrice: true,
      sellingPrice: true,
      lowStockAlert: true,
      status: true,
      description: true,
      category: true,
      inventories: {
        select: {
          quantity: true
        },
        where: branchId ? { branchId } : undefined
      }
    },
    orderBy: { sku: "asc" },
    take: q ? 100 : 80
  });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {products.map((product) => {
          const totalQuantity = product.inventories.reduce((sum, item) => sum + item.quantity, 0);

          return (
            <div key={product.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-start gap-3">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="h-20 w-20 rounded-2xl object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-slate-100" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.88rem] font-semibold uppercase tracking-wide text-slate-400">{product.sku}</p>
                      <p className="mt-1 text-[1.1rem] font-bold leading-snug text-slate-900">{product.name}</p>
                    </div>
                    {canEditProducts || canAdjustInventory ? (
                      <div className="flex flex-col gap-2">
                        {canEditProducts ? (
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
                        ) : null}
                        {canAdjustInventory && branchId ? (
                          <ProductStockAdjustModal
                            productId={product.id}
                            productName={product.name}
                            branchId={branchId}
                            currentQuantity={totalQuantity}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <p className="mt-2 text-[0.95rem] text-slate-500">{product.category?.name ?? "Chưa có nhóm"}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Giá bán</p>
                  <p className="mt-1 text-[1.05rem] font-bold text-slate-900">{formatCurrency(Number(product.sellingPrice))}</p>
                </div>
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Tồn kho</p>
                  <p className={`mt-1 text-[1.05rem] font-bold ${totalQuantity <= product.lowStockAlert ? "text-red-500" : "text-slate-900"}`}>{totalQuantity}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[0.95rem] text-slate-500">
                <span>Barcode: {product.barcode ?? "-"}</span>
                <span>Cảnh báo: {product.lowStockAlert}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className="min-w-[980px] text-left">
          <thead className="bg-slate-50 text-[15px] font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Ảnh</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã SP</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Tên sản phẩm</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Nhóm</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Barcode</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Giá bán</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Tồn kho</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Cảnh báo</th>
              {canEditProducts || canAdjustInventory ? <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const totalQuantity = product.inventories.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <tr key={product.id} className="border-t border-slate-100 text-[15px] text-slate-700 sm:text-2xl">
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt={product.name} className="h-10 w-10 rounded-xl object-cover sm:h-14 sm:w-14" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-slate-100 sm:h-14 sm:w-14" />
                    )}
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{product.sku}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">{product.name}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{product.category?.name ?? "-"}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{product.barcode ?? "-"}</td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(Number(product.sellingPrice))}</td>
                  <td className={`px-3 py-3 text-right font-semibold sm:px-6 sm:py-4 ${totalQuantity <= product.lowStockAlert ? "text-red-500" : "text-slate-900"}`}>
                    {totalQuantity}
                  </td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{product.lowStockAlert}</td>
                  {canEditProducts || canAdjustInventory ? (
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      <div className="flex justify-end gap-2">
                        {canAdjustInventory && branchId ? (
                          <ProductStockAdjustModal
                            productId={product.id}
                            productName={product.name}
                            branchId={branchId}
                            currentQuantity={totalQuantity}
                          />
                        ) : null}
                        {canEditProducts ? (
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
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsListFallback() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex gap-3">
            <div className="h-20 w-20 animate-pulse rounded-2xl bg-slate-100" />
            <div className="flex-1">
              <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-6 w-72 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-50" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canCreateProducts = true;
  const canEditProducts = session.role === "ADMIN" || session.role === "MANAGER";
  const canDeleteProducts = session.role === "ADMIN";
  const canAdjustInventory = session.role === "ADMIN" || session.role === "MANAGER";
  const q = searchParams?.q ?? "";
  const activeBranch = session.branchId
    ? await prisma.branch.findUnique({ where: { id: session.branchId }, select: { id: true } })
    : await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const branchId = activeBranch?.id ?? "";
  const productWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { sku: { contains: q, mode: "insensitive" as const } },
          { barcode: { contains: q, mode: "insensitive" as const } },
          { category: { name: { contains: q, mode: "insensitive" as const } } }
        ]
      }
    : undefined;

  const [productCount, categories, brands] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);

  const categoryOptions = categories.map((item) => ({ id: item.id, name: item.name }));
  const brandOptions = brands.map((item) => ({ id: item.id, name: item.name }));
  const displayCount = productCount;

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Hàng hóa" description={`${displayCount} đầu mục sản phẩm`} session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="w-full max-w-xl">
          <AutocompleteSearchInput
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, nhóm hàng..."
            suggestions={[]}
            fetchUrl="/api/products/search?limit=30"
          />
        </form>
        {canCreateProducts ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-soft sm:px-6 sm:py-4 sm:text-2xl">
                + Thêm SP
              </summary>
              <div className="absolute right-0 top-16 z-20 w-[92vw] max-w-[500px] sm:top-20">
                <ProductCreateForm categories={categoryOptions} brands={brandOptions} />
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <Suspense fallback={<ProductsListFallback />}>
        <ProductsList
          q={q}
          branchId={branchId}
          canEditProducts={canEditProducts}
          canDeleteProducts={canDeleteProducts}
          canAdjustInventory={canAdjustInventory}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
        />
      </Suspense>
    </div>
  );
}
