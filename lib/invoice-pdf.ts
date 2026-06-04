import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { jsPDF } from "jspdf";
import { calculateInvoiceDebtBreakdown } from "@/lib/invoice-totals";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

type InvoicePdfOrder = {
  id: string;
  code: string;
  createdAt: Date;
  subtotal: number;
  discountTotal: number;
  otherCharge: number;
  paidAmount: number;
  debtAmount: number;
  grandTotal: number;
  oldDebtAmount: number;
  note: string;
  branch: {
    name: string;
    address: string;
    phone: string;
  };
  createdBy: {
    name: string;
  };
  customer: {
    code: string;
    name: string;
    phone: string;
    address: string;
  };
  items: Array<{
    id: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
};

let cachedFontBase64: string | null = null;

function getFontBase64() {
  if (cachedFontBase64) return cachedFontBase64;
  const fontPath = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");
  cachedFontBase64 = fs.readFileSync(fontPath).toString("base64");
  return cachedFontBase64;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

function buildInvoicePdfBuffer(order: InvoicePdfOrder) {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait"
  });

  const fontBase64 = getFontBase64();
  doc.addFileToVFS("NotoSans-Regular.ttf", fontBase64);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans", "normal");

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  let y = 16;
  const bodyFontSize = 20;
  const sectionFontSize = 20;
  const tableFontSize = 20;
  const totalFontSize = 20;
  const noteFontSize = 17;
  const debtBreakdown = calculateInvoiceDebtBreakdown({
    grandTotal: order.grandTotal,
    paidAmount: order.paidAmount,
    debtAmount: order.debtAmount,
    oldDebtAmount: order.oldDebtAmount
  });

  const line = (text: string, x = marginX, size = 11, options?: { align?: "left" | "right" | "center"; width?: number }) => {
    doc.setFontSize(size);
    if (options?.align === "right") {
      doc.text(text, pageWidth - marginX, y, { align: "right" });
    } else if (options?.align === "center") {
      doc.text(text, pageWidth / 2, y, { align: "center" });
    } else {
      doc.text(text, x, y, { maxWidth: options?.width });
    }
    y += size * 0.34 + 1;
  };

  const sectionTitle = (text: string) => {
    y += 1;
    doc.setFontSize(sectionFontSize);
    doc.setFont("NotoSans", "normal");
    doc.text(text, marginX, y);
    y += 3;
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.5;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight <= pageHeight - 14) return;
    doc.addPage();
    doc.setFont("NotoSans", "normal");
    y = 16;
  };

  line("ĐƠN ĐẶT HÀNG", marginX, 30, { align: "center" });
  line(order.code, marginX, 18, { align: "center" });

  sectionTitle("Thông tin hóa đơn");
  line(`Chi nhánh: ${order.branch.name}`, marginX, bodyFontSize);
  line(`Địa chỉ: ${order.branch.address || "-"}`, marginX, bodyFontSize);
  line(`Điện thoại: ${order.branch.phone || "-"}`, marginX, bodyFontSize);
  line(`Ngày tạo: ${formatDate(order.createdAt)}`, marginX, bodyFontSize);
  line(`Người lập: ${order.createdBy.name}`, marginX, bodyFontSize);

  sectionTitle("Thông tin khách hàng");
  line(`Mã khách hàng: ${order.customer.code}`, marginX, bodyFontSize);
  line(`Khách hàng: ${order.customer.name}`, marginX, bodyFontSize);
  line(`SĐT: ${order.customer.phone || "-"}`, marginX, bodyFontSize);
  line(`Địa chỉ: ${order.customer.address || "-"}`, marginX, bodyFontSize);

  sectionTitle("Sản phẩm");
  doc.setFontSize(tableFontSize);
  doc.text("STT", marginX, y);
  doc.text("Sản phẩm", 24, y);
  doc.text("SL", 145, y, { align: "right" });
  doc.text("Đơn giá", 170, y, { align: "right" });
  doc.text("Thành tiền", pageWidth - marginX, y, { align: "right" });
  y += 6;
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;

  for (const [index, item] of order.items.entries()) {
    const productLines = doc.splitTextToSize(item.name, 106) as string[];
    const rowHeight = Math.max(productLines.length * 8, 8) + 2;
    ensureSpace(rowHeight + 6);

    doc.setFontSize(tableFontSize);
    doc.text(String(index + 1), marginX, y);
    doc.text(productLines, 24, y);
    doc.text(String(item.quantity), 145, y, { align: "right" });
    doc.text(formatMoney(item.unitPrice), 170, y, { align: "right" });
    doc.text(formatMoney(item.total), pageWidth - marginX, y, { align: "right" });
    y += rowHeight;
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 2.5;
  }

  ensureSpace(debtBreakdown.oldDebt > 0 ? 72 : 62);
  sectionTitle("Thanh toán");
  if (debtBreakdown.oldDebt > 0) {
    line(`Nợ cũ: ${formatMoney(debtBreakdown.oldDebt)}`, marginX, totalFontSize);
  }
  line(`Tổng cộng: ${formatMoney(order.subtotal)}`, marginX, totalFontSize);
  line(`Thu khác: ${formatMoney(order.otherCharge)}`, marginX, totalFontSize);
  line(`Tổng hóa đơn: ${formatMoney(debtBreakdown.invoiceTotal)}`, marginX, totalFontSize);
  line(`Tổng cần thanh toán: ${formatMoney(debtBreakdown.totalPayable)}`, marginX, totalFontSize);
  line(`Đã trả: ${formatMoney(order.paidAmount)}`, marginX, totalFontSize);
  line(`Còn nợ sau hóa đơn: ${formatMoney(debtBreakdown.remainingDebt)}`, marginX, totalFontSize);

  if (order.note) {
    sectionTitle("Ghi chú");
    const noteLines = doc.splitTextToSize(order.note, pageWidth - marginX * 2) as string[];
    doc.setFontSize(noteFontSize);
    doc.text(noteLines, marginX, y);
    y += noteLines.length * 6 + 2;
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

export async function getInvoicePdfOrder(orderId: string): Promise<InvoicePdfOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      createdAt: true,
      subtotal: true,
      discountTotal: true,
      otherCharge: true,
      paidAmount: true,
      debtAmount: true,
      grandTotal: true,
      oldDebtAmount: true,
      note: true,
      branch: {
        select: {
          name: true,
          address: true,
          phone: true
        }
      },
      createdBy: {
        select: { name: true }
      },
      customer: {
        select: {
          code: true,
          name: true,
          phone: true,
          address: true
        }
      },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          total: true,
          product: {
            select: {
              sku: true,
              name: true
            }
          }
        },
        orderBy: { id: "asc" }
      }
    }
  });

  if (!order) return null;

  return {
    id: order.id,
    code: order.code,
    createdAt: order.createdAt,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    otherCharge: Number(order.otherCharge),
    paidAmount: Number(order.paidAmount),
    debtAmount: Number(order.debtAmount),
    grandTotal: Number(order.grandTotal),
    oldDebtAmount: Number(order.oldDebtAmount),
    note: order.note || "",
    branch: {
      name: order.branch.name,
      address: order.branch.address || "",
      phone: order.branch.phone || ""
    },
    createdBy: {
      name: order.createdBy.name
    },
    customer: {
      code: order.customer.code,
      name: order.customer.name,
      phone: order.customer.phone || "",
      address: order.customer.address || ""
    },
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total)
    }))
  };
}

export async function generateAndStoreInvoicePdf(orderId: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[PDF] Skipping PDF upload to Vercel Blob because BLOB_READ_WRITE_TOKEN is not set.");
    return null;
  }

  const order = await getInvoicePdfOrder(orderId);
  if (!order) {
    throw new Error("Không tìm thấy hóa đơn để tạo PDF");
  }

  const pdfBuffer = buildInvoicePdfBuffer(order);
  const pdfFileName = `${order.code.toLowerCase()}-hoa-don.pdf`;
  const pathname = `invoices/${order.id}/${Date.now()}-${pdfFileName}`;

  const blob = await put(pathname, pdfBuffer, {
    access: "private",
    contentType: "application/pdf"
  });

  return prisma.order.update({
    where: { id: orderId },
    data: {
      pdfUrl: blob.url,
      pdfFileName,
      pdfSize: pdfBuffer.byteLength,
      pdfGeneratedAt: new Date()
    },
    select: {
      id: true,
      pdfUrl: true,
      pdfFileName: true,
      pdfSize: true,
      pdfGeneratedAt: true
    }
  });
}
