"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function PurchaseCreateModal({
  branchId,
  suppliers,
  products
}: {
  branchId: string;
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; importPrice: number; batchNumber: string; expiryDate: string }>>([]);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  const matched = useMemo(() => products.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10), [products, search]);

  function addProduct(productId: string) {
    setItems((prev) => [...prev, { productId, quantity: 1, importPrice: 0, batchNumber: "", expiryDate: "" }]);
    setSearch("");
  }

  function submit() {
    startTransition(async () => {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, supplierId, paidAmount, note, items })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể tạo phiếu nhập", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã tạo phiếu nhập", description: payload.purchase.code });
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-2xl bg-emerald-600 px-6 py-4 text-2xl font-semibold text-white shadow-soft">
        + Tạo phiếu nhập
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-5xl rounded-[28px] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-5xl font-bold">Tạo phiếu nhập</h3>
              <button onClick={() => setOpen(false)} className="text-5xl text-slate-500">×</button>
            </div>
            <div className="mt-6 space-y-4">
              <select className="h-16 w-full rounded-2xl border border-slate-300 px-5 text-2xl" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-16 w-full rounded-2xl border border-slate-300 px-5 text-2xl" placeholder="Tìm theo tên hàng..." />
              {search ? (
                <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200">
                  {matched.map((product) => (
                    <button key={product.id} className="block w-full border-b border-slate-100 px-4 py-3 text-left text-xl" onClick={() => addProduct(product.id)}>
                      {product.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="space-y-3">
                {items.map((item, index) => {
                  const product = products.find((p) => p.id === item.productId);
                  return (
                    <div key={`${item.productId}-${index}`} className="grid grid-cols-[1.4fr_0.5fr_0.7fr_0.8fr_0.8fr] gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xl">{product?.name}</div>
                      <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="number" value={item.quantity} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, quantity: Number(e.target.value) } : line))} />
                      <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="number" value={item.importPrice} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, importPrice: Number(e.target.value) } : line))} />
                      <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" placeholder="Số lô" value={item.batchNumber} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, batchNumber: e.target.value } : line))} />
                      <input className="rounded-xl border border-slate-200 px-4 py-3 text-xl" type="date" value={item.expiryDate} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, expiryDate: e.target.value } : line))} />
                    </div>
                  );
                })}
              </div>
              <input className="h-16 w-full rounded-2xl border border-slate-300 px-5 text-2xl" type="number" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value))} placeholder="Đã trả" />
              <textarea className="h-24 w-full rounded-2xl border border-slate-300 px-5 py-4 text-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" />
              <Button className="h-16 w-full text-3xl" onClick={submit} disabled={isPending || items.length === 0}>{isPending ? "Đang tạo..." : "Tạo phiếu nhập"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
