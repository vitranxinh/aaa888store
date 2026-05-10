"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  id: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  hasPendingDeleteRequest?: boolean;
  orderCode?: string;
  onOptimisticRemove?: () => void;
  onOptimisticRollback?: () => void;
  onServerSuccess?: (payload: { mode: "requested" | "cancelled"; code: string; alreadyCancelled?: boolean }) => void;
};

export function OrderStatusActions({
  id,
  role,
  hasPendingDeleteRequest = false,
  orderCode,
  onOptimisticRemove,
  onOptimisticRollback,
  onServerSuccess
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function handleDelete() {
    if (hasPendingDeleteRequest && role !== "ADMIN") {
      return;
    }

    const confirmed =
      role === "ADMIN"
        ? window.confirm("Hủy hóa đơn này? Hệ thống sẽ hoàn lại kho, xóa phiếu thu liên quan và cập nhật lại công nợ.")
        : window.confirm("Gửi yêu cầu hủy hóa đơn này đến tài khoản sếp?");

    if (!confirmed) return;

    startTransition(async () => {
      if (role === "ADMIN") {
        onOptimisticRemove?.();
        pushToast({
          title: "Đã hủy hóa đơn, đang hoàn tồn kho...",
          description: orderCode ?? "Đang xử lý hóa đơn"
        });
      }

      try {
        const response = await fetch(`/api/orders/${id}`, {
          method: "DELETE"
        });
        const payload = await response.json();

        if (!response.ok) {
          onOptimisticRollback?.();
          pushToast({
            title: role === "ADMIN" ? "Không thể hủy hóa đơn" : "Không thể gửi yêu cầu hủy",
            description: payload.error,
            variant: "error"
          });
          return;
        }

        if (payload.mode === "requested") {
          pushToast({
            title: "Đã gửi yêu cầu hủy",
            description: `Hóa đơn ${payload.code} đang chờ sếp duyệt`
          });
        } else {
          pushToast({
            title: payload.alreadyCancelled ? "Hóa đơn đã được hủy trước đó" : "Hàng đã được hoàn vào kho.",
            description: payload.code
          });
        }

        onServerSuccess?.(payload);

        if (payload.mode === "cancelled" && pathname?.startsWith("/orders/")) {
          router.refresh();
          return;
        }

        router.refresh();
      } catch (error) {
        onOptimisticRollback?.();
        pushToast({
          title: role === "ADMIN" ? "Không thể hủy hóa đơn" : "Không thể gửi yêu cầu hủy",
          description: error instanceof Error ? error.message : "Lỗi mạng hoặc phiên đăng nhập đã hết hạn",
          variant: "error"
        });
      }
    });
  }

  if (hasPendingDeleteRequest && role !== "ADMIN") {
    return (
      <Button variant="outline" disabled className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50">
        Chờ sếp duyệt hủy
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
        {isPending ? (role === "ADMIN" ? "Đang hủy..." : "Đang gửi...") : role === "ADMIN" ? "Hủy" : "Yêu cầu hủy"}
      </Button>
    </div>
  );
}
