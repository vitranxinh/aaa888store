import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { calculateInvoiceDebtBreakdown } from "@/lib/invoice-totals";
import { uploadInvoicePdf } from "@/lib/invoice-storage";
import { prisma } from "@/lib/prisma";
import { formatDate, formatInvoiceFileName } from "@/lib/utils";

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
    expiryDates: string[];
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

function formatExpiryDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(value);
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
  const contentWidth = pageWidth - marginX * 2;
  const bodyFontSize = 8.5;
  const sectionFontSize = 9.5;
  const tableFontSize = 8;
  const totalFontSize = 8;
  const noteFontSize = 8;
  const borderColor = 110;
  const debtBreakdown = calculateInvoiceDebtBreakdown({
    grandTotal: order.grandTotal,
    paidAmount: order.paidAmount,
    debtAmount: order.debtAmount,
    oldDebtAmount: order.oldDebtAmount
  });

  doc.setDrawColor(borderColor);
  doc.setLineWidth(0.25);

  const text = (value: string | string[], x: number, textY: number, size = bodyFontSize, options?: { align?: "left" | "right" | "center"; maxWidth?: number }) => {
    doc.setFontSize(size);
    doc.text(value, x, textY, { align: options?.align, maxWidth: options?.maxWidth, lineHeightFactor: 1.25 });
  };

  const lineHeight = (size: number) => size * 0.36 + 1.2;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight <= pageHeight - 16) return;
    doc.addPage();
    doc.setFont("NotoSans", "normal");
    doc.setDrawColor(borderColor);
    doc.setLineWidth(0.25);
    y = 16;
  };

  const drawLabelValue = (label: string, value: string, boxX: number, boxY: number, width: number) => {
    const labelWidth = 30;
    const valueLines = doc.splitTextToSize(value || "-", width - labelWidth - 4) as string[];
    const rowHeight = Math.max(lineHeight(bodyFontSize), valueLines.length * lineHeight(bodyFontSize));
    text(label, boxX, boxY, bodyFontSize);
    text(valueLines, boxX + labelWidth, boxY, bodyFontSize);
    return rowHeight;
  };

  text("ĐƠN ĐẶT HÀNG", pageWidth / 2, y, 15, { align: "center" });
  y += 7;
  text(order.code, pageWidth / 2, y, 9.5, { align: "center" });
  y += 6;
  text(order.branch.name, pageWidth / 2, y, 8.5, { align: "center" });
  y += 5;
  text(`SĐT: ${order.branch.phone || "-"}`, pageWidth / 2, y, 8.5, { align: "center" });
  y += 7;

  const infoX = marginX;
  const infoY = y;
  const infoPadding = 3;
  let infoCursorY = y + 7;
  text("Thông tin hóa đơn", infoX + infoPadding, infoCursorY, sectionFontSize);
  infoCursorY += 7;
  infoCursorY += drawLabelValue("Chi nhánh:", order.branch.name, infoX + infoPadding, infoCursorY, contentWidth - infoPadding * 2);
  infoCursorY += drawLabelValue("Địa chỉ:", order.branch.address || "-", infoX + infoPadding, infoCursorY, contentWidth - infoPadding * 2);
  infoCursorY += drawLabelValue("Điện thoại:", order.branch.phone || "-", infoX + infoPadding, infoCursorY, contentWidth - infoPadding * 2);
  infoCursorY += drawLabelValue("Ngày tạo:", formatDate(order.createdAt), infoX + infoPadding, infoCursorY, contentWidth - infoPadding * 2);
  infoCursorY += drawLabelValue("Người lập:", order.createdBy.name, infoX + infoPadding, infoCursorY, contentWidth - infoPadding * 2);
  infoCursorY += 3;
  doc.rect(infoX, infoY, contentWidth, infoCursorY - infoY);
  y = infoCursorY + 4;

  const customerY = y;
  let customerCursorY = y + 7;
  text("Thông tin khách hàng", infoX + infoPadding, customerCursorY, sectionFontSize);
  customerCursorY += 7;
  customerCursorY += drawLabelValue("Mã KH:", order.customer.code, infoX + infoPadding, customerCursorY, contentWidth - infoPadding * 2);
  customerCursorY += drawLabelValue("Khách hàng:", order.customer.name, infoX + infoPadding, customerCursorY, contentWidth - infoPadding * 2);
  customerCursorY += drawLabelValue("SĐT:", order.customer.phone || "-", infoX + infoPadding, customerCursorY, contentWidth - infoPadding * 2);
  customerCursorY += drawLabelValue("Địa chỉ:", order.customer.address || "-", infoX + infoPadding, customerCursorY, contentWidth - infoPadding * 2);
  customerCursorY += 3;
  doc.rect(infoX, customerY, contentWidth, customerCursorY - customerY);
  y = customerCursorY + 5;

  const tableX = marginX;
  const colWidths = [9, 94, 12, 32, 39];
  const colX = colWidths.reduce<number[]>((points, width) => {
    points.push(points[points.length - 1] + width);
    return points;
  }, [tableX]);
  const tableRight = tableX + colWidths.reduce((sum, width) => sum + width, 0);
  const drawCellText = (value: string | string[], colIndex: number, rowY: number, rowHeight: number, size = tableFontSize, align: "left" | "right" | "center" = "left") => {
    const padding = 1.5;
    const x =
      align === "right"
        ? colX[colIndex + 1] - padding
        : align === "center"
          ? (colX[colIndex] + colX[colIndex + 1]) / 2
          : colX[colIndex] + padding;
    const lines = Array.isArray(value) ? value : [value];
    const renderedHeight = lines.length * lineHeight(size);
    const textY = rowY + Math.max(3.8, (rowHeight - renderedHeight) / 2 + lineHeight(size) - 1);
    text(value, x, textY, size, { align, maxWidth: colWidths[colIndex] - padding * 2 });
  };
  const drawTableRow = (height: number, values: Array<string | string[]>, aligns: Array<"left" | "right" | "center">, size = tableFontSize) => {
    ensureSpace(height + 18);
    doc.rect(tableX, y, tableRight - tableX, height);
    for (let i = 1; i < colX.length - 1; i += 1) doc.line(colX[i], y, colX[i], y + height);
    values.forEach((value, index) => drawCellText(value, index, y, height, size, aligns[index]));
    y += height;
  };

  drawTableRow(7, ["STT", "Sản phẩm", "SL", "Đ.Giá", "T.Tiền"], ["center", "center", "center", "center", "center"], 8);

  const renderedRows = [...order.items];
  while (renderedRows.length < 4) {
    renderedRows.push({ id: `blank-${renderedRows.length}`, sku: "", name: "", expiryDates: [], quantity: 0, unitPrice: 0, total: 0 });
  }

  for (const [index, item] of renderedRows.entries()) {
    if (!item.name) {
      drawTableRow(7, ["", "", "", "", ""], ["center", "left", "center", "right", "right"]);
      continue;
    }
    const productLines = doc.splitTextToSize(item.name, colWidths[1] - 3) as string[];
    if (item.expiryDates.length > 0) {
      const expiryLines = doc.splitTextToSize(`HSD: ${item.expiryDates.join(", ")}`, colWidths[1] - 3) as string[];
      productLines.push(...expiryLines);
    }
    const rowHeight = Math.max(7, productLines.length * lineHeight(tableFontSize) + 3);
    drawTableRow(
      rowHeight,
      [String(index + 1), productLines, String(item.quantity), formatMoney(item.unitPrice), formatMoney(item.total)],
      ["center", "left", "center", "right", "right"],
      tableFontSize
    );
  }

  const drawTotalRow = (label: string, value: string, emphasize = false) => {
    ensureSpace(8);
    const rowHeight = 7;
    doc.rect(tableX, y, tableRight - tableX, rowHeight);
    doc.line(colX[4], y, colX[4], y + rowHeight);
    text(label, colX[4] - 1.5, y + rowHeight / 2 + totalFontSize * 0.16, totalFontSize, { align: "right" });
    text(value, tableRight - 1.5, y + rowHeight / 2 + totalFontSize * 0.16, emphasize ? 8.5 : totalFontSize, { align: "right" });
    y += rowHeight;
  };

  drawTotalRow("Tổng cộng", formatMoney(order.subtotal), true);
  drawTotalRow("Thu khác", formatMoney(order.otherCharge));
  if (debtBreakdown.oldDebt > 0) {
    drawTotalRow("Nợ cũ", formatMoney(debtBreakdown.oldDebt));
    drawTotalRow("Tổng cần thanh toán", formatMoney(debtBreakdown.totalPayable), true);
  }
  drawTotalRow("Số tiền đã trả", formatMoney(order.paidAmount));
  drawTotalRow("CÒN NỢ SAU HÓA ĐƠN", formatMoney(debtBreakdown.remainingDebt), true);
  y += 6;

  ensureSpace(36);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;
  text("Ghi chú:", marginX, y, noteFontSize);
  y += 6;
  const noteLines = doc.splitTextToSize(order.note || "Không có ghi chú.", contentWidth) as string[];
  text(noteLines, marginX, y, noteFontSize);
  y += noteLines.length * lineHeight(noteFontSize) + 4;
  text("KHÔNG NHẬN TRẢ HÀNG TRỪ TRƯỜNG HỢP LỖI TỪ NHÀ SẢN XUẤT VÀ QUẦY", pageWidth / 2, y, 8, { align: "center" });
  y += 5;
  text("Quý khách vui lòng quay video khi nhận hàng để giải quyết khiếu nại nếu phát sinh.", pageWidth / 2, y, 8, { align: "center" });
  y += 5;
  text("Mọi khiếu nại xin phản hồi trong vòng 7 ngày kể từ ngày nhận hàng.", pageWidth / 2, y, 8, { align: "center" });
  y += 5;
  text("Sau thời gian này Quầy xin phép không giải quyết.", pageWidth / 2, y, 8, { align: "center" });

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
          productId: true,
          quantity: true,
          unitPrice: true,
          total: true,
          product: {
            select: {
              sku: true,
              name: true,
              expiryDate: true
            }
          }
        },
        orderBy: { id: "asc" }
      }
    }
  });

  if (!order) return null;

  const saleTransactions = await prisma.inventoryTransaction.findMany({
    where: {
      referenceCode: order.code,
      type: "SALE",
      productId: { in: order.items.map((item) => item.productId) },
      batch: { expiryDate: { not: null } }
    },
    select: {
      productId: true,
      batch: {
        select: {
          expiryDate: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  const batchExpiryDatesByProduct = new Map<string, string[]>();
  for (const transaction of saleTransactions) {
    if (!transaction.productId || !transaction.batch?.expiryDate) continue;
    const dates = batchExpiryDatesByProduct.get(transaction.productId) ?? [];
    const formattedDate = formatExpiryDate(transaction.batch.expiryDate);
    if (!dates.includes(formattedDate)) dates.push(formattedDate);
    batchExpiryDatesByProduct.set(transaction.productId, dates);
  }

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
      expiryDates:
        batchExpiryDatesByProduct.get(item.productId) ??
        (item.product.expiryDate ? [formatExpiryDate(item.product.expiryDate)] : []),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total)
    }))
  };
}

export async function generateAndStoreInvoicePdf(orderId: string) {
  const order = await getInvoicePdfOrder(orderId);
  if (!order) {
    throw new Error("Không tìm thấy hóa đơn để tạo PDF");
  }

  const pdfBuffer = buildInvoicePdfBuffer(order);
  const pdfFileName = formatInvoiceFileName(order.code, order.createdAt);
  const generatedAt = new Date();
  const storedPdf = await uploadInvoicePdf({
    orderId: order.id,
    orderCode: order.code,
    createdAt: order.createdAt,
    pdfBuffer,
    pdfFileName,
    generatedAt
  });

  if (!storedPdf) return null;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      pdfUrl: storedPdf.url,
      pdfFileName,
      pdfSize: pdfBuffer.byteLength,
      pdfGeneratedAt: generatedAt
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
