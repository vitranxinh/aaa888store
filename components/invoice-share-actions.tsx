"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type Props = {
  orderCode: string;
  invoicePath: string;
  customerPhone?: string | null;
  shareText: string;
};

export function InvoiceShareActions({ orderCode, invoicePath, customerPhone, shareText }: Props) {
  const [isSharing, setIsSharing] = useState(false);
  const pushToast = useToastStore((state) => state.push);

  function fallbackCopyText(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function getAbsoluteInvoiceUrl(autoPrint = false) {
    const suffix = autoPrint ? "?autoprint=1" : "";
    return `${window.location.origin}${invoicePath}${suffix}`;
  }

  async function shareViaZalo() {
    const absoluteUrl = getAbsoluteInvoiceUrl(false);
    const textToShare = `${shareText}\n${absoluteUrl}`;

    try {
      setIsSharing(true);

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `Hóa đơn ${orderCode}`,
          text: textToShare
        });
        return;
      }

      fallbackCopyText(textToShare);
      pushToast({
        title: "Đã sao chép nội dung hóa đơn",
        description: "Mở Zalo và dán nội dung để gửi cho khách."
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      pushToast({
        title: "Không thể chia sẻ hóa đơn",
        description: error instanceof Error ? error.message : "Không thể chia sẻ qua Zalo",
        variant: "error"
      });
    } finally {
      setIsSharing(false);
    }
  }

  function shareViaSms() {
    const absoluteUrl = getAbsoluteInvoiceUrl(false);
    const targetPhone = (customerPhone || "").replace(/[^\d+]/g, "");
    const body = encodeURIComponent(`${shareText}\n${absoluteUrl}`);
    const smsUrl = targetPhone ? `sms:${targetPhone}?&body=${body}` : `sms:?&body=${body}`;
    window.location.href = smsUrl;
  }

  function exportPdf() {
    window.open(getAbsoluteInvoiceUrl(true), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={exportPdf}>
        Xuất PDF
      </Button>
      <Button variant="outline" onClick={shareViaZalo} disabled={isSharing}>
        {isSharing ? "Đang chia sẻ..." : "Gửi qua Zalo"}
      </Button>
      <Button variant="outline" onClick={shareViaSms}>
        Gửi qua SMS
      </Button>
    </div>
  );
}
