import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { AppHeader } from "@/components/app-header";
import { AutocompleteSearchInput } from "@/components/autocomplete-search-input";
import { ProductCreateLauncher } from "@/components/product-create-launcher";
import { ProductEditModal } from "@/components/product-edit-modal";
import { ServerPagination } from "@/components/server-pagination";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultBranchId } from "@/lib/reference-data";
import { formatCurrency } from "@/lib/utils";

const getCachedProductsPageData = unstable_cache(
  async ({
    q,
    status,
    branchId,
    page,
    pageSize
  }: {
    q: string;
    status: "all" | "active" | "inactive";
    branchId: string;
    page: number;
    pageSize: number;
  }) => {
    const startedAt = Date.now();
    const productWhere = {
      ...(status === "active" ? { status: "ACTIVE" as const } : {}),
      ...(status === "inactive" ? { status: "INACTIVE" as const } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { barcode: { contains: q, mode: "insensitive" as const } },
              { category: { name: { contains: q, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };

    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        category: {
          select: { id: true, name: true }
        },
        inventories: {
          where: {
            branchId,
            variantId: null
          },
          select: { quantity: true }
        },
        _count: {
          select: {
            inventories: true,
            batches: true,
            orderItems: true,
            purchaseItems: true,
            inventoryTxns: true
          }
        }
      },
      orderBy: { sku: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize + 1
    });
    
    const hasNext = products.length > pageSize;
    const visibleProducts = hasNext ? products.slice(0, pageSize) : products;

    const result = visibleProducts.map((product) => {
      const quantity = product.inventories.reduce((sum, inv) => sum + inv.quantity, 0);
      const hasRelatedHistory =
        product._count.inventories > 0 ||
        product._count.batches > 0 ||
        product._count.orderItems > 0 ||
        product._count.purchaseItems > 0 ||
        product._count.inventoryTxns > 0;
      
      return {
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
        description: product.description,
        categoryName: product.category?.name ?? null,
        quantity,
        hasRelatedHistory
      };
    });

    console.info("[perf][products-page]", {
      q,
      status,
      rowCount: result.length,
      fullDurationMs: Date.now() - startedAt
    });

    return {
      hasNext,
      products: result
    };
  },
  ["products-page-data"],
  { revalidate: 15, tags: ["products-page"] }
);

async function ProductsList({
  q,
  status,
  branchId,
  page,
  pageSize,
  canEditProducts,
  canDeleteProducts,
}: {
  q: string;
  status: "all" | "active" | "inactive";
  branchId: string;
  page: number;
  pageSize: number;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
}) {
  const { products, hasNext } = await getCachedProductsPageData({
    q,
    status,
    branchId,
    page,
    pageSize
  });

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {products.map((product) => {
          const totalQuantity = product.quantity;

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
                    {canEditProducts ? (
                      <div className="flex flex-col gap-2">
                        <ProductEditModal
                          product={product}
                          currentQuantity={totalQuantity}
                          status={product.status}
                          hasRelatedHistory={product.hasRelatedHistory}
                          canDelete={canDeleteProducts}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-[0.95rem] text-slate-500">{product.categoryName ?? "Chưa có nhóm"}</p>
                    {product.status === "INACTIVE" ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-[0.76rem] font-semibold text-amber-700">
                        Đã ẩn khỏi danh sách bán
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="text-[0.85rem] font-medium text-slate-400">Giá bán</p>
                  <p className="mt-1 text-[1.05rem] font-bold text-slate-900">{formatCurrency(product.sellingPrice)}</p>
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
              {canEditProducts ? <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const totalQuantity = product.quantity;

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
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{product.categoryName ?? "-"}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">{product.barcode ?? "-"}</td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">{formatCurrency(product.sellingPrice)}</td>
                  <td className={`px-3 py-3 text-right font-semibold sm:px-6 sm:py-4 ${totalQuantity <= product.lowStockAlert ? "text-red-500" : "text-slate-900"}`}>
                    {totalQuantity}
                  </td>
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                    {product.status === "INACTIVE" ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                        Đã ẩn khỏi danh sách bán
                      </span>
                    ) : (
                      product.lowStockAlert
                    )}
                  </td>
                  {canEditProducts ? (
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      <div className="flex justify-end gap-2">
                        <ProductEditModal
                          product={product}
                          currentQuantity={totalQuantity}
                          status={product.status}
                          hasRelatedHistory={product.hasRelatedHistory}
                          canDelete={canDeleteProducts}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ServerPagination pathname="/products" query={{ q, status }} page={page} pageSize={pageSize} hasNext={hasNext} />
    </>
  );
}

function ProductsListFallback() {
  return (
    <div className="grid min-h-[720px] gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="min-h-[168px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
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
  searchParams?: { q?: string; page?: string; status?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canCreateProducts = true;
  const canEditProducts = session.role === "ADMIN" || session.role === "MANAGER";
  const canDeleteProducts = session.role === "ADMIN";
  const q = searchParams?.q ?? "";
  const rawStatus = searchParams?.status;
  const status: "all" | "active" | "inactive" =
    rawStatus === "all" || rawStatus === "inactive" ? rawStatus : "active";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = 10;
  const branchId = session.branchId ?? (await getDefaultBranchId()) ?? "";
  return (
    <div className="max-w-full space-y-5 overflow-x-hidden sm:space-y-8">
      <AppHeader title="Hàng hóa" description="Quản lý danh mục sản phẩm" session={session} />

      <div className="flex min-h-[56px] flex-col gap-3 lg:min-h-[64px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="min-w-0 w-full max-w-xl">
          <AutocompleteSearchInput
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, nhóm hàng..."
            suggestions={[]}
            fetchUrl={`/api/products/search?limit=30${status !== "all" ? `&status=${status}` : ""}`}
          />
        </form>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/products?${new URLSearchParams({ ...(q ? { q } : {}), status: "all" }).toString()}`}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-soft transition ${
                status === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600"
              }`}
            >
              Tất cả
            </a>
            <a
              href={`/products?${new URLSearchParams({ ...(q ? { q } : {}), status: "active" }).toString()}`}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-soft transition ${
                status === "active" ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
              }`}
            >
              Đang bán
            </a>
            <a
              href={`/products?${new URLSearchParams({ ...(q ? { q } : {}), status: "inactive" }).toString()}`}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-soft transition ${
                status === "inactive" ? "bg-amber-500 text-white" : "bg-white text-slate-600"
              }`}
            >
              Đã ẩn
            </a>
          </div>
          {canCreateProducts ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <ProductCreateLauncher />
            </div>
          ) : null}
        </div>
      </div>

      <Suspense fallback={<ProductsListFallback />}>
        <ProductsList
          q={q}
          status={status}
          branchId={branchId}
          page={page}
          pageSize={pageSize}
          canEditProducts={canEditProducts}
          canDeleteProducts={canDeleteProducts}
        />
      </Suspense>
    </div>
  );
}
