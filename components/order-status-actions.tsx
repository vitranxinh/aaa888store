"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function OrderStatusActions({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  if (status === "CANCELLED") {
    return null;
  }

  function updateStatus(nextStatus: "CANCELLED") {
    startTransition(async () => {
      const response = await fetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật đơn", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã cập nhật đơn hàng", description: `Trạng thái mới: ${nextStatus}` });
      window.location.reload();
    });
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" disabled={isPending} onClick={() => updateStatus("CANCELLED")}>
        Hủy
      </Button>
    </div>
  );
}
