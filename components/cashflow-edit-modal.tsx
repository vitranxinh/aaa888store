"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AsyncLookupInput } from "@/components/async-lookup-input";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  transaction: {
    id: string;
    code: string;
    type: "RECEIPT" | "PAYMENT";
    amount: number;
    note: string | null;
    orderId: string | null;
    purchaseOrderId: string | null;
    customerId: string | null;
    supplierId: string | null;
    orderCode?: string | null;
    purchaseOrderCode?: string | null;
    customerName?: string | null;
    supplierName?: string | null;
  };
  branchId: string;
};

export function CashflowEditModal({ transaction, branchId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"RECEIPT" | "PAYMENT">(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [orderId, setOrderId] = useState(transaction.orderId ?? "");
  const [customerId, setCustomerId] = useState(transaction.customerId ?? "");
  const [note, setNote] = useState(transaction.note ?? "");
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function submit() {
    startTransition(async () => {
      const body =
        type === "RECEIPT" ? { branchId, type, amount, orderId, customerId, note } : { branchId, type, amount, note };
      const response = await fetch(`/api/cash-transactions/${transaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật phiếu", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã cập nhật phiếu", description: transaction.code });
      setOpen(false);
      router.refresh();
    });
  }

  function deleteTxn() {
    const confirmed = window.confirm("Xóa phiếu thu/chi này? Hệ thống sẽ tự tính lại công nợ liên quan.");
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/cash-transactions/${transaction.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể xóa phiếu", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã xóa phiếu", description: payload.code });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sửa
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa phiếu thu / chi</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{transaction.code}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl text-slate-500 sm:text-5xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
            <div className="grid gap-4">
              <select
                className="h-14 rounded-2xl border border-slate-300 px-4 text-xl"
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as "RECEIPT" | "PAYMENT";
                  setType(nextType);
                  setOrderId("");
                  setCustomerId("");
                }}
              >
                <option value="RECEIPT">Phiếu thu khách hàng</option>
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
                    initialLabel={transaction.customerName ?? ""}
                  />
                  <AsyncLookupInput
                    value={orderId}
                    onChange={(nextValue) => setOrderId(nextValue)}
                    fetchUrl="/api/cashflow/options?kind=order"
                    placeholder="Chọn hóa đơn"
                    initialLabel={transaction.orderCode ?? ""}
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-500">
                  Phiếu chi hiện chỉ lưu số tiền và ghi chú nội bộ, không còn gắn với nhà cung cấp.
                </div>
              )}
              <textarea
                className="h-24 rounded-2xl border border-slate-300 px-4 py-3 text-xl"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type === "RECEIPT" ? "Ghi chú phiếu thu" : "Lý do chi / ghi chú"}
              />
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white pt-4">
                <Button variant="destructive" className="h-14 text-xl" onClick={deleteTxn} loading={isPending}>
                  Xóa phiếu
                </Button>
                <Button className="h-14 text-xl" onClick={submit} loading={isPending} disabled={amount <= 0}>
                  Lưu thay đổi
                </Button>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
