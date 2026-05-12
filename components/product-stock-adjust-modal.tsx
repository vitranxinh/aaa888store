"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { useToastStore } from "@/store/toast-store";

type Props = {
  productId: string;
  productName: string;
  branchId: string;
  currentQuantity: number;
};

export function ProductStockAdjustModal({ productId, productName, branchId, currentQuantity }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayQuantity, setDisplayQuantity] = useState(currentQuantity);
  const [targetQuantity, setTargetQuantity] = useState(currentQuantity);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
    setDisplayQuantity(currentQuantity);
    setTargetQuantity(currentQuantity);
  }, [currentQuantity]);

  const delta = targetQuantity - displayQuantity;

  function resetAndOpen() {
    setTargetQuantity(displayQuantity);
    setNote("");
    setOpen(true);
  }

  function submit() {
    startTransition(async () => {
      try {
        if (targetQuantity < 0) {
          pushToast({ title: "Tồn kho không hợp lệ", description: "Tồn mới không được nhỏ hơn 0.", variant: "error" });
          return;
        }

        if (delta === 0) {
          pushToast({ title: "Không có thay đổi", description: "Tồn kho mới đang bằng tồn kho hiện tại." });
          return;
        }

        const response = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            productId,
            type: "ADJUSTMENT",
            quantity: delta,
            targetQuantity,
            note: note.trim() || `Điều chỉnh tồn trực tiếp từ ${displayQuantity} lên ${targetQuantity}`
          })
        });

        const payload = await response.json();
        if (!response.ok) {
          pushToast({
            title: "Không thể cập nhật tồn kho",
            description: payload.error ?? "Có lỗi xảy ra khi điều chỉnh tồn kho",
            variant: "error"
          });
          return;
        }

        pushToast({
          title: "Đã cập nhật tồn kho",
          description: `${productName}: ${displayQuantity} → ${targetQuantity}`
        });
        setDisplayQuantity(targetQuantity);
        setOpen(false);
        router.refresh();
      } catch (error) {
        pushToast({
          title: "Không thể cập nhật tồn kho",
          description: error instanceof Error ? error.message : "Lỗi mạng khi điều chỉnh tồn kho",
          variant: "error"
        });
      }
    });
  }

  return (
    <>
      <button
        onClick={resetAndOpen}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-700 shadow-sm"
      >
        Chỉnh tồn
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Chỉnh tồn kho</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{productName}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:text-5xl">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
              <div className="grid gap-4">
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Tồn hiện tại</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{displayQuantity}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Chênh lệch</p>
                    <p className={`mt-1 text-2xl font-bold ${delta < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-lg">Tồn mới</label>
                  <FormattedNumberInput
                    min={0}
                    value={targetQuantity}
                    onValueChange={setTargetQuantity}
                    className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-xl"
                    placeholder="Nhập tồn mới"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-lg">Ghi chú</label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="h-24 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-lg"
                    placeholder="Ví dụ: kiểm kho lại, chỉnh tay..."
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button onClick={submit} loading={isPending}>
                Lưu tồn kho
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
