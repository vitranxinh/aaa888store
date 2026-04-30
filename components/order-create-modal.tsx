"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  customers: { id: string; name: string }[];
  products: { id: string; name: string; sellingPrice: number }[];
  branchId: string;
};

export function OrderCreateModal({ customers, products, branchId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Array<{ productId: string; quantity: number; unitPrice: number; discountValue: number }>>([]);
  const pushToast = useToastStore((state) => state.push);

  const matchedProducts = useMemo(() => {
    const q = productQuery.toLowerCase();
    return products.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 12);
  }, [productQuery, products]);

  function addProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setLines((prev) => [...prev, { productId, quantity: 1, unitPrice: product.sellingPrice, discountValue: 0 }]);
    setProductQuery("");
  }

  function updateLine(index: number, key: "quantity" | "unitPrice" | "discountValue", value: number) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function submit() {
    startTransition(async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          customerId,
          paymentMethod: "CASH",
          paidAmount: 0,
          orderDiscount: 0,
          note,
          status: "PARTIAL",
          items: lines
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể tạo hóa đơn", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã tạo hóa đơn", description: payload.order.code });
      setOpen(false);
      setLines([]);
      setNote("");
      window.location.reload();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-emerald-600 px-6 py-4 text-2xl font-semibold text-white shadow-soft"
      >
        + Tạo HĐ
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-5xl rounded-[28px] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-5xl font-bold text-slate-900">Tạo hóa đơn mới</h3>
              <button onClick={() => setOpen(false)} className="text-5xl text-slate-500">×</button>
            </div>
            <div className="mt-8 space-y-6">
              <div>
                <label className="mb-3 block text-2xl font-semibold text-slate-900">Khách hàng</label>
                <select
                  className="h-16 w-full rounded-2xl border border-slate-300 px-5 text-2xl"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-3 block text-2xl font-semibold text-slate-900">Sản phẩm</label>
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="-- Chọn SP --"
                  className="h-16 w-full rounded-2xl border border-slate-300 px-5 text-2xl"
                />
                {productQuery ? (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                    {matchedProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="block w-full border-b border-slate-100 px-4 py-3 text-left text-xl hover:bg-slate-50"
                        onClick={() => addProduct(product.id)}
                      >
                        {product.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                {lines.length === 0 ? (
                  <div className="h-28 rounded-2xl bg-slate-100" />
                ) : (
                  <div className="space-y-3">
                    {lines.map((line, index) => {
                      const product = products.find((item) => item.id === line.productId);
                      return (
                        <div key={`${line.productId}-${index}`} className="grid grid-cols-[1.8fr_0.6fr_0.8fr_0.8fr_0.4fr] gap-3">
                          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xl">{product?.name}</div>
                          <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="number" value={line.quantity} onChange={(e) => updateLine(index, "quantity", Number(e.target.value))} />
                          <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="number" value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", Number(e.target.value))} />
                          <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="number" value={line.discountValue} onChange={(e) => updateLine(index, "discountValue", Number(e.target.value))} />
                          <button className="rounded-xl border border-slate-200 text-xl" onClick={() => removeLine(index)}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-3 block text-2xl font-semibold text-slate-900">Ghi chú</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-28 w-full rounded-2xl border border-slate-300 px-5 py-4 text-xl"
                />
              </div>
              <Button className="h-16 w-full text-3xl" onClick={submit} disabled={isPending || lines.length === 0}>
                {isPending ? "Đang tạo..." : "Tạo hóa đơn"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
