"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

export function ShareInvoiceButton({
  orderCode,
  invoicePath
}: {
  orderCode: string;
  invoicePath: string;
}) {
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

  async function shareInvoice() {
    const absoluteUrl = `${window.location.origin}${invoicePath}`;

    try {
      setIsSharing(true);

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `Hóa đơn ${orderCode}`,
          text: `Chia sẻ hóa đơn ${orderCode} cho khách hàng`,
          url: absoluteUrl
        });
        return;
      }

      fallbackCopyText(absoluteUrl);

      pushToast({
        title: "Đã sao chép link hóa đơn",
        description: absoluteUrl
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      pushToast({
        title: "Không thể chia sẻ hóa đơn",
        description: error instanceof Error ? error.message : "Không thể chia sẻ link hóa đơn",
        variant: "error"
      });
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <Button variant="outline" onClick={shareInvoice} disabled={isSharing}>
      {isSharing ? "Đang chia sẻ..." : "Chia sẻ hóa đơn"}
    </Button>
  );
}
