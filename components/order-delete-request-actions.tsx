"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function OrderDeleteRequestActions({
  requestId,
  orderCode
}: {
  requestId: string;
  orderCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function act(action: "approve" | "reject") {
    startTransition(async () => {
      const response = await fetch(`/api/orders/delete-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({
          title: "Không thể xử lý yêu cầu xóa",
          description: payload.error,
          variant: "error"
        });
        return;
      }

      pushToast({
        title: action === "approve" ? "Đã duyệt xóa hóa đơn" : "Đã từ chối yêu cầu xóa",
        description: orderCode
      });

      window.location.reload();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={isPending} onClick={() => act("approve")}>
        Duyệt xóa
      </Button>
      <Button variant="outline" disabled={isPending} onClick={() => act("reject")}>
        Từ chối
      </Button>
    </div>
  );
}
