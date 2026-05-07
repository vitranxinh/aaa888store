import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { jsPDF } from "jspdf";
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

  const line = (text: string, x = marginX, size = 11, options?: { align?: "left" | "right" | "center"; width?: number }) => {
    doc.setFontSize(size);
    if (options?.align === "right") {
      doc.text(text, pageWidth - marginX, y, { align: "right" });
    } else if (options?.align === "center") {
      doc.text(text, pageWidth / 2, y, { align: "center" });
    } else {
      doc.text(text, x, y, { maxWidth: options?.width });
    }
    y += size * 0.5 + 2;
  };

  const sectionTitle = (text: string) => {
    y += 2;
    doc.setFontSize(12);
    doc.setFont("NotoSans", "normal");
    doc.text(text, marginX, y);
    y += 4;
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight <= pageHeight - 14) return;
    doc.addPage();
    doc.setFont("NotoSans", "normal");
    y = 16;
  };

  line("ĐƠN ĐẶT HÀNG", marginX, 18, { align: "center" });
  line(order.code, marginX, 12, { align: "center" });

  sectionTitle("Thông tin hóa đơn");
  line(`Chi nhánh: ${order.branch.name}`);
  line(`Địa chỉ: ${order.branch.address || "-"}`);
  line(`Điện thoại: ${order.branch.phone || "-"}`);
  line(`Ngày tạo: ${formatDate(order.createdAt)}`);
  line(`Người lập: ${order.createdBy.name}`);

  sectionTitle("Thông tin khách hàng");
  line(`Mã khách hàng: ${order.customer.code}`);
  line(`Khách hàng: ${order.customer.name}`);
  line(`SĐT: ${order.customer.phone || "-"}`);
  line(`Địa chỉ: ${order.customer.address || "-"}`);

  sectionTitle("Sản phẩm");
  doc.setFontSize(10);
  doc.text("Sản phẩm", marginX, y);
  doc.text("SL", 145, y, { align: "right" });
  doc.text("Đơn giá", 170, y, { align: "right" });
  doc.text("Thành tiền", pageWidth - marginX, y, { align: "right" });
  y += 4;
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 4;

  for (const item of order.items) {
    const productLabel = `${item.sku} - ${item.name}`;
    const productLines = doc.splitTextToSize(productLabel, 118) as string[];
    const rowHeight = Math.max(productLines.length * 5, 5) + 2;
    ensureSpace(rowHeight + 8);

    doc.setFontSize(10);
    doc.text(productLines, marginX, y);
    doc.text(String(item.quantity), 145, y, { align: "right" });
    doc.text(formatMoney(item.unitPrice), 170, y, { align: "right" });
    doc.text(formatMoney(item.total), pageWidth - marginX, y, { align: "right" });
    y += rowHeight;
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 4;
  }

  ensureSpace(44);
  sectionTitle("Thanh toán");
  line(`Tổng cộng: ${formatMoney(order.subtotal)}`, marginX, 11);
  line(`Giảm giá: ${formatMoney(order.discountTotal)}`, marginX, 11);
  line(`Thu khác: ${formatMoney(order.otherCharge)}`, marginX, 11);
  line(`Đã trả: ${formatMoney(order.paidAmount)}`, marginX, 11);
  line(`Còn nợ: ${formatMoney(order.debtAmount)}`, marginX, 11);
  line(`Tổng thanh toán: ${formatMoney(order.grandTotal)}`, marginX, 12);

  if (order.note) {
    sectionTitle("Ghi chú");
    const noteLines = doc.splitTextToSize(order.note, pageWidth - marginX * 2) as string[];
    doc.setFontSize(10);
    doc.text(noteLines, marginX, y);
    y += noteLines.length * 5 + 2;
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
    throw new Error("BLOB_READ_WRITE_TOKEN is missing");
  }

  const order = await getInvoicePdfOrder(orderId);
  if (!order) {
    throw new Error("Không tìm thấy hóa đơn để tạo PDF");
  }

  const pdfBuffer = buildInvoicePdfBuffer(order);
  const pdfFileName = `${order.code.toLowerCase()}-hoa-don.pdf`;
  const pathname = `invoices/${order.id}/${Date.now()}-${pdfFileName}`;

  const blob = await put(pathname, pdfBuffer, {
    access: "public",
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
