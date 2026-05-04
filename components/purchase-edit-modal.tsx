"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useToastStore } from "@/store/toast-store";

type PurchaseItemValue = {
  productId: string;
  productName: string;
  quantity: number;
  importPrice: number;
  batchNumber: string;
  expiryDate: string;
};

type Props = {
  purchase: {
    id: string;
    code: string;
    branchId: string;
    supplierId: string;
    paidAmount: number;
    note: string | null;
    items: PurchaseItemValue[];
  };
};

type ProductSuggestion = {
  id: string;
  label: string;
  meta?: string;
};

export function PurchaseEditModal({ purchase }: Props) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(purchase.supplierId);
  const [note, setNote] = useState(purchase.note ?? "");
  const [search, setSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSuggestion[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [items, setItems] = useState<PurchaseItemValue[]>(purchase.items);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
    if (!open) return;
    const query = search.trim();

    if (!query) {
      setProductResults([]);
      setIsSearchingProducts(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingProducts(true);
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=20`, {
          signal: controller.signal,
          credentials: "same-origin"
        });
        if (!response.ok) {
          setProductResults([]);
          return;
        }

        const payload = (await response.json()) as Array<{ id: string; label: string; meta?: string }>;
        setProductResults(
          payload.map((item) => ({
            id: item.id,
            label: item.label,
            meta: item.meta
          }))
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setProductResults([]);
        }
      } finally {
        setIsSearchingProducts(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, search]);

  function addProduct(product: ProductSuggestion) {
    setItems((prev) => [
      ...prev,
      { productId: product.id, productName: product.label, quantity: 1, importPrice: 0, batchNumber: "", expiryDate: "" }
    ]);
    setSearch("");
    setProductResults([]);
  }

  function submit() {
    startTransition(async () => {
      const response = await fetch(`/api/purchases/${purchase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: purchase.branchId,
          supplierId,
          paidAmount: purchase.paidAmount,
          note,
          items: items.map(({ productId, quantity, importPrice, batchNumber, expiryDate }) => ({
            productId,
            quantity,
            importPrice,
            batchNumber,
            expiryDate
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật phiếu nhập", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã cập nhật phiếu nhập", description: purchase.code });
      setOpen(false);
      window.location.reload();
    });
  }

  function deletePurchase() {
    const confirmed = window.confirm("Xóa phiếu nhập này? Hệ thống sẽ hoàn kho, xóa phiếu chi liên quan và cập nhật lại công nợ NCC.");
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/purchases/${purchase.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể xóa phiếu nhập", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã xóa phiếu nhập", description: payload.code });
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sửa
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[28px]">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-4 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa phiếu nhập</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{purchase.code}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl text-slate-500 sm:text-5xl">×</button>
          </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-300 px-4 text-base sm:h-14 sm:text-xl" placeholder="Tìm theo tên hàng..." />
              {search ? (
                <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200">
                  {isSearchingProducts ? (
                    <div className="px-4 py-3 text-sm text-slate-500 sm:text-lg">Đang tìm sản phẩm...</div>
                  ) : productResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500 sm:text-lg">Không tìm thấy sản phẩm.</div>
                  ) : (
                    productResults.map((product) => (
                      <button key={product.id} type="button" className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm sm:text-lg" onClick={() => addProduct(product)}>
                        <div className="font-semibold text-slate-900">{product.label}</div>
                        <div className="mt-1 text-xs text-slate-500 sm:text-sm">{product.meta ?? ""}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 sm:px-5 sm:text-lg">
                    Chưa có dòng hàng nào trong phiếu nhập này.
                  </div>
                ) : null}
                {items.map((item, index) => {
                  const lineTotal = item.quantity * item.importPrice;
                  return (
                    <div key={`${item.productId}-${index}`} className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-soft sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-snug text-slate-900 sm:text-xl">{item.productName}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:text-sm">Dòng hàng {index + 1}</p>
                        </div>
                        <button type="button" className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== index))}>
                          Xóa
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:text-sm">Số lượng</span>
                          <input className="h-11 w-full rounded-xl border border-slate-200 px-3 text-base sm:h-12 sm:text-lg" type="number" min="1" value={item.quantity} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, quantity: Number(e.target.value) } : line))} placeholder="Số lượng" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:text-sm">Giá nhập</span>
                          <input className="h-11 w-full rounded-xl border border-slate-200 px-3 text-base sm:h-12 sm:text-lg" type="number" min="0" value={item.importPrice} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, importPrice: Number(e.target.value) } : line))} placeholder="Giá nhập" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:text-sm">Số lô</span>
                          <input className="h-11 w-full rounded-xl border border-slate-200 px-3 text-base sm:h-12 sm:text-lg" value={item.batchNumber} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, batchNumber: e.target.value } : line))} placeholder="Không bắt buộc" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:text-sm">Hạn dùng</span>
                          <input className="h-11 w-full rounded-xl border border-slate-200 px-3 text-base sm:h-12 sm:text-lg" type="date" value={item.expiryDate} onChange={(e) => setItems((prev) => prev.map((line, idx) => idx === index ? { ...line, expiryDate: e.target.value } : line))} />
                        </label>
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                        <span className="text-sm font-medium text-slate-500 sm:text-base">Thành tiền</span>
                        <span className="text-sm font-bold whitespace-nowrap text-slate-900 sm:text-xl">{formatCurrency(lineTotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <textarea className="h-24 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:h-24 sm:text-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:px-7">
              <Button variant="destructive" className="h-12 text-sm sm:h-14 sm:text-xl" onClick={deletePurchase} disabled={isPending}>
                Xóa phiếu nhập
              </Button>
              <Button className="h-12 text-sm sm:h-14 sm:text-xl" onClick={submit} disabled={isPending || items.length === 0}>
                {isPending ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
