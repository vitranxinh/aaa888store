"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AsyncLookupInput } from "@/components/async-lookup-input";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function CashflowCreateModal({
  branchId
}: {
  branchId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"RECEIPT" | "PAYMENT">("RECEIPT");
  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function submit() {
    startTransition(async () => {
      const response = await fetch("/api/cash-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, type, amount, orderId, purchaseOrderId, customerId, supplierId, note })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể tạo phiếu", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã tạo phiếu", description: payload.transaction.code });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-2xl bg-emerald-600 px-6 py-4 text-2xl font-semibold text-white shadow-soft">
        + Tạo phiếu
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <h3 className="text-2xl font-bold sm:text-5xl">Phiếu thu / chi</h3>
              <button onClick={() => setOpen(false)} className="text-4xl text-slate-500 sm:text-5xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
            <div className="grid gap-4">
              <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" value={type} onChange={(e) => setType(e.target.value as "RECEIPT" | "PAYMENT")}>
                <option value="RECEIPT">Phiếu thu</option>
                <option value="PAYMENT">Phiếu chi</option>
              </select>
              <FormattedNumberInput className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" min={0} value={amount} onValueChange={setAmount} placeholder="Số tiền" />
              {type === "RECEIPT" ? (
                <>
                  <AsyncLookupInput
                    value={customerId}
                    onChange={(nextValue) => setCustomerId(nextValue)}
                    fetchUrl="/api/cashflow/options?kind=customer"
                    placeholder="Chọn khách hàng"
                  />
                  <AsyncLookupInput
                    value={orderId}
                    onChange={(nextValue) => setOrderId(nextValue)}
                    fetchUrl="/api/cashflow/options?kind=order"
                    placeholder="Chọn hóa đơn"
                  />
                </>
              ) : (
                <>
                  <AsyncLookupInput
                    value={supplierId}
                    onChange={(nextValue) => setSupplierId(nextValue)}
                    fetchUrl="/api/cashflow/options?kind=supplier"
                    placeholder="Chọn NCC"
                  />
                  <AsyncLookupInput
                    value={purchaseOrderId}
                    onChange={(nextValue) => setPurchaseOrderId(nextValue)}
                    fetchUrl="/api/cashflow/options?kind=purchase"
                    placeholder="Chọn phiếu nhập"
                  />
                </>
              )}
              <textarea className="h-24 rounded-2xl border border-slate-300 px-4 py-3 text-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do / ghi chú" />
              <div className="sticky bottom-0 border-t border-slate-100 bg-white pt-4">
                <Button className="h-16 w-full text-3xl" onClick={submit} loading={isPending} disabled={amount <= 0}>Lưu phiếu</Button>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
