"use client";

import { useRef, useState } from "react";
import { InvoiceDocument } from "@/components/invoice-document";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

type InvoiceItem = {
  sku: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Props = {
  code: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  createdAt: Date | string | null;
  createdByName: string;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethodLabel: string;
  note: string;
  subtotal: number;
  discountTotal?: number;
  otherCharge?: number;
  paidAmount: number;
  debtAmount: number;
  grandTotal: number;
  items: InvoiceItem[];
  pdfUrl?: string | null;
  pdfFileName?: string | null;
};

export function InvoicePdfActions(props: Props) {
  const [isBusy, setIsBusy] = useState(false);
  const pushToast = useToastStore((state) => state.push);
  const templateRef = useRef<HTMLDivElement>(null);

  async function buildPdfFile() {
    if (!templateRef.current) {
      throw new Error("Không tìm thấy mẫu hóa đơn để xuất PDF");
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

    const canvas = await html2canvas(templateRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: false,
      logging: false
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    const pdfWidth = 297;
    const pdfHeight = 210;
    const horizontalMargin = 6;
    const verticalMargin = 6;
    const imageData = canvas.toDataURL("image/png");
    const maxWidth = pdfWidth - horizontalMargin * 2;
    const maxHeight = pdfHeight - verticalMargin * 2;
    const widthScale = maxWidth / canvas.width;
    const heightScale = maxHeight / canvas.height;
    const scale = Math.min(widthScale, heightScale);
    const imgWidth = canvas.width * scale;
    const imgHeight = canvas.height * scale;
    const x = (pdfWidth - imgWidth) / 2;
    const y = (pdfHeight - imgHeight) / 2;

    pdf.addImage(imageData, "PNG", x, y, imgWidth, imgHeight, undefined, "FAST");

    const blob = pdf.output("blob");
    const filename = `${props.code.toLowerCase()}-hoa-don.pdf`;

    return new File([blob], filename, { type: "application/pdf" });
  }

  async function sharePdf() {
    try {
      setIsBusy(true);

      if (props.pdfUrl) {
        const anchor = document.createElement("a");
        anchor.href = props.pdfUrl;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.download = props.pdfFileName || `${props.code.toLowerCase()}-hoa-don.pdf`;
        anchor.click();
        return;
      }

      const file = await buildPdfFile();

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `Hóa đơn ${props.code}`,
          text: `Hóa đơn ${props.code}`,
          files: [file]
        });
        return;
      }

      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      pushToast({
        title: "Thiết bị không hỗ trợ chia sẻ file",
        description: "PDF đã được tải xuống để bạn gửi qua app khác."
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      pushToast({
        title: "Không thể chia sẻ PDF",
        description: error instanceof Error ? error.message : "Không thể chia sẻ hóa đơn",
        variant: "error"
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={sharePdf} disabled={isBusy}>
        {isBusy ? "Đang tạo PDF..." : "Chia sẻ PDF"}
      </Button>

      <div className="fixed left-[-100000px] top-0 z-[-1]">
        <div ref={templateRef} className="w-[1123px] bg-white p-0">
          <InvoiceDocument
            branchName={props.branchName}
            branchAddress={props.branchAddress}
            branchPhone={props.branchPhone}
            createdAt={props.createdAt}
            printedAt={props.createdAt}
            createdByName={props.createdByName}
            code={props.code}
            customerCode={props.customerCode}
            customerName={props.customerName}
            customerAddress={props.customerAddress}
            customerPhone={props.customerPhone}
            paymentMethodLabel={props.debtAmount > 0 ? "Còn nợ" : "Đã thanh toán"}
            subtotal={props.subtotal}
            discountTotal={props.discountTotal || 0}
            otherCharge={props.otherCharge || 0}
            paidAmount={props.paidAmount}
            debtAmount={props.debtAmount}
            grandTotal={props.grandTotal}
            note={props.note}
            items={props.items}
            mode="pdf"
            minRows={4}
          />
        </div>
      </div>
    </>
  );
}
