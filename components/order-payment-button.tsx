"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function OrderPaymentButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

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
      window.location.reload();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xl font-semibold shadow-sm">
        Thanh toán
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
            <h3 className="text-3xl font-bold text-slate-900">Thanh toán hóa đơn</h3>
            <input
              type="number"
              className="mt-5 h-14 w-full rounded-2xl border border-slate-300 px-4 text-2xl"
              placeholder="Nhập số tiền"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Đóng</Button>
              <Button onClick={submit} disabled={isPending || amount <= 0}>{isPending ? "Đang lưu..." : "Xác nhận"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
