"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePosStore, usePosTotals } from "@/store/pos-store";
import { useToastStore } from "@/store/toast-store";
import { formatCurrency } from "@/lib/utils";

type PosData = Awaited<ReturnType<typeof import("@/lib/data").getPosData>>;

export function PosScreen({ data, defaultBranchId }: { data: PosData; defaultBranchId?: string | null }) {
  const [keyword, setKeyword] = useState("");
  const [isPending, startTransition] = useTransition();
  const totals = usePosTotals();
  const toast = useToastStore((state) => state.push);
  const store = usePosStore();

  const filteredProducts = useMemo(() => {
    const lower = keyword.toLowerCase();
    return data.products.filter((product) => {
      const matched = [product.name, product.sku, product.barcode ?? ""].join(" ").toLowerCase().includes(lower);
      const stock = product.inventories[0]?.quantity ?? 0;
      return matched && stock >= 0;
    });
  }, [data.products, keyword]);

  async function handleCheckout(status: "DRAFT" | "COMPLETED") {
    startTransition(async () => {
      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: store.branchId || defaultBranchId,
          customerId: store.customerId,
          paymentMethod: store.paymentMethod,
          paidAmount: store.paidAmount,
          orderDiscount: store.orderDiscount,
          note: store.note,
          status,
          items: store.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountValue: item.discountValue
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        toast({ title: "Không thể lưu đơn", description: payload.error, variant: "error" });
        return;
      }
      store.clear();
      toast({
        title: status === "DRAFT" ? "Đã lưu đơn nháp" : "Thanh toán thành công",
        description: `Mã đơn ${payload.order.code}`
      });
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Card>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên, SKU, barcode"
              className="pl-9"
            />
          </div>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={store.branchId ?? defaultBranchId ?? data.branches[0]?.id ?? ""}
            onChange={(e) => store.setBranch(e.target.value)}
          >
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={store.customerId ?? ""}
            onChange={(e) => store.setCustomer(e.target.value || undefined)}
          >
            <option value="">Khách lẻ</option>
            {data.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.phone}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.slice(0, 18).map((product) => {
            const stock = product.inventories[0]?.quantity ?? 0;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() =>
                  store.addItem({
                    productId: product.id,
                    name: product.name,
                    sku: product.sku,
                    quantity: 1,
                    unitPrice: product.sellingPrice,
                    costPrice: product.costPrice,
                    discountValue: 0,
                    stock
                  })
                }
                className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-teal-500 hover:bg-teal-50"
              >
                <p className="font-semibold text-slate-900">{product.name}</p>
                <p className="mt-1 text-xs text-slate-500">{product.sku}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold text-teal-700">{formatCurrency(product.sellingPrice)}</span>
                  <span className={stock <= product.lowStockAlert ? "text-red-600" : "text-slate-500"}>Tồn {stock}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="sticky top-4 h-fit">
        <CardTitle>Giỏ hàng POS</CardTitle>
        <CardDescription className="mt-1">Hỗ trợ giảm giá theo dòng, toàn đơn và nhiều phương thức thanh toán.</CardDescription>

        <div className="mt-4 space-y-4">
          {store.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              Chưa có sản phẩm trong giỏ.
            </div>
          ) : (
            store.items.map((item) => (
              <div key={item.productId} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.sku}</p>
                  </div>
                  <button type="button" onClick={() => store.removeItem(item.productId)}>
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={item.stock}
                    value={item.quantity}
                    onChange={(e) => store.updateQuantity(item.productId, Math.min(Number(e.target.value), item.stock))}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={item.unitPrice}
                    onChange={(e) => store.updatePrice(item.productId, Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={item.discountValue}
                    onChange={(e) => store.updateDiscount(item.productId, Number(e.target.value))}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Tạm tính</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Giảm giá đơn</span>
            <Input
              type="number"
              min={0}
              value={store.orderDiscount}
              onChange={(e) => store.setOrderDiscount(Number(e.target.value))}
              className="w-36"
            />
          </div>
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Tổng thanh toán</span>
            <span>{formatCurrency(totals.grandTotal)}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={store.paymentMethod}
              onChange={(e) => store.setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "MIXED")}
            >
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
              <option value="MIXED">Thanh toán hỗn hợp</option>
            </select>
            <Input
              type="number"
              min={0}
              value={store.paidAmount}
              onChange={(e) => store.setPaidAmount(Number(e.target.value))}
              placeholder="Số tiền khách trả"
            />
          </div>
          <textarea
            value={store.note}
            onChange={(e) => store.setNote(e.target.value)}
            className="h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ghi chú đơn hàng"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <Button variant="outline" onClick={() => handleCheckout("DRAFT")} disabled={isPending || store.items.length === 0}>
            Lưu đơn nháp
          </Button>
          <Button onClick={() => handleCheckout("COMPLETED")} disabled={isPending || store.items.length === 0}>
            {isPending ? "Đang xử lý..." : "Thanh toán"}
          </Button>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Khuyến mãi đang áp dụng</p>
          <div className="mt-3 space-y-2">
            {data.promotions.length === 0 ? (
              <p className="text-sm text-slate-500">Hiện không có chương trình khuyến mãi nào.</p>
            ) : (
              data.promotions.slice(0, 3).map((promotion) => (
                <div key={promotion.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{promotion.name}</p>
                  <p>
                    {promotion.type === "PERCENT" ? `Giảm ${promotion.value}%` : `Giảm ${formatCurrency(promotion.value)}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
