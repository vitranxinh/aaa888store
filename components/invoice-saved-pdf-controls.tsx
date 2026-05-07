"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  orderId: string;
  pdfUrl?: string | null;
};

export function InvoiceSavedPdfControls({ orderId, pdfUrl }: Props) {
  const router = useRouter();
  const pushToast = useToastStore((state) => state.push);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    if (isGenerating) return;

    try {
      setIsGenerating(true);
      const response = await fetch(`/api/orders/${orderId}/pdf`, {
        method: "POST",
        credentials: "same-origin"
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({
          title: "Không thể tạo PDF lưu trữ",
          description: payload.error ?? "Có lỗi khi tạo PDF hóa đơn",
          variant: "error"
        });
        return;
      }

      pushToast({
        title: "Đã lưu PDF hóa đơn",
        description: payload.code
      });
      router.refresh();
    } catch (error) {
      pushToast({
        title: "Không thể tạo PDF lưu trữ",
        description: error instanceof Error ? error.message : "Có lỗi khi tạo PDF hóa đơn",
        variant: "error"
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Xem PDF đã lưu
        </a>
      ) : null}
      <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? "Đang tạo PDF..." : pdfUrl ? "Tạo lại PDF" : "Tạo PDF lưu trữ"}
      </Button>
    </div>
  );
}
