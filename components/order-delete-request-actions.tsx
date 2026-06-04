"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function OrderDeleteRequestActions({
  requestId,
  orderCode,
  onOptimisticRemove,
  onOptimisticRollback
}: {
  requestId: string;
  orderCode: string;
  onOptimisticRemove?: () => void;
  onOptimisticRollback?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);
  const router = useRouter();

  function act(action: "approve" | "reject") {
    startTransition(async () => {
      const card = document.querySelector(`[data-delete-request-id="${requestId}"]`) as HTMLElement | null;
      card?.classList.add("hidden");
      onOptimisticRemove?.();
      try {
        const response = await fetch(`/api/orders/delete-requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        });
        const payload = await response.json();

        if (!response.ok) {
          card?.classList.remove("hidden");
          onOptimisticRollback?.();
          pushToast({
            title: "Không thể xử lý yêu cầu xóa",
            description: payload.error,
            variant: "error"
          });
          return;
        }

        pushToast({
          title:
            payload.mode === "already_processed"
              ? "Yêu cầu này đã được xử lý trước đó"
              : action === "approve"
                ? "Đã duyệt xóa hóa đơn"
                : "Đã từ chối yêu cầu xóa",
          description: orderCode
        });

        router.refresh();
      } catch (error) {
        card?.classList.remove("hidden");
        onOptimisticRollback?.();
        pushToast({
          title: "Không thể xử lý yêu cầu xóa",
          description: error instanceof Error ? error.message : "Lỗi mạng, vui lòng thử lại",
          variant: "error"
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button loading={isPending} onClick={() => act("approve")}>
        Duyệt xóa
      </Button>
      <Button variant="outline" loading={isPending} onClick={() => act("reject")}>
        Từ chối
      </Button>
    </div>
  );
}
