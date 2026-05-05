"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function OrderPaymentButton({ orderId, remainingAmount = 0 }: { orderId: string; remainingAmount?: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(remainingAmount);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const response = await fetch(`/api/orders/${orderId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paymentMethod: "CASH" })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thanh toán", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã cập nhật thanh toán", description: "Công nợ đã được điều chỉnh" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setAmount(remainingAmount);
          setOpen(true);
        }}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xl font-semibold shadow-sm"
      >
        Thanh toán
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/35 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:rounded-[24px]">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-4 py-4 sm:p-6">
              <h3 className="text-2xl font-bold text-slate-900 sm:text-3xl">Thanh toán hóa đơn</h3>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:hidden">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:pb-6">
              <FormattedNumberInput
                className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-2xl"
                placeholder="Nhập số tiền"
                value={amount}
                onValueChange={setAmount}
              />
              <div className="sticky bottom-0 mt-5 flex justify-end gap-3 border-t border-slate-100 bg-white pt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Đóng</Button>
                <Button onClick={submit} loading={isPending} disabled={amount <= 0}>Xác nhận</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
