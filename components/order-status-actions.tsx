"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  id: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  hasPendingDeleteRequest?: boolean;
};

export function OrderStatusActions({ id, role, hasPendingDeleteRequest = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function handleDelete() {
    if (hasPendingDeleteRequest && role !== "ADMIN") {
      return;
    }

    const confirmed =
      role === "ADMIN"
        ? window.confirm("Xóa hóa đơn này? Hệ thống sẽ hoàn lại kho, xóa phiếu thu liên quan và cập nhật lại công nợ.")
        : window.confirm("Gửi yêu cầu xóa hóa đơn này đến tài khoản sếp?");

    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/orders/${id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({
          title: role === "ADMIN" ? "Không thể xóa hóa đơn" : "Không thể gửi yêu cầu xóa",
          description: payload.error,
          variant: "error"
        });
        return;
      }

      if (payload.mode === "requested") {
        pushToast({
          title: "Đã gửi yêu cầu xóa",
          description: `Hóa đơn ${payload.code} đang chờ sếp duyệt`
        });
      } else {
        pushToast({
          title: "Đã xóa hóa đơn",
          description: payload.code
        });
      }

      window.location.reload();
    });
  }

  if (hasPendingDeleteRequest && role !== "ADMIN") {
    return (
      <Button variant="outline" disabled className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50">
        Chờ sếp duyệt xóa
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
        {role === "ADMIN" ? "Xóa" : "Yêu cầu xóa"}
      </Button>
    </div>
  );
}
