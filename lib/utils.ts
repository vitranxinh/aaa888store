import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatVietnamDateTime } from "@/lib/date-range";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string) {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

export function formatCustomerDebt(value: number | string) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount > 0) return formatCurrency(amount);
  if (amount < 0) return `Dư ${formatCurrency(Math.abs(amount))}`;
  return "Không nợ";
}

export function formatDate(value?: string | Date | null, fallback = "—") {
  return formatVietnamDateTime(value, fallback);
}

export function formatInvoiceFileName(code: string, createdAt?: string | Date | null) {
  const parts = getVietnamDateTimeParts(createdAt);
  const safeCode = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "hoa-don";

  return `${safeCode}-${parts.hour}${parts.minute}-${parts.day}${parts.month}${parts.year2}-hoa-don.pdf`;
}

export function formatInvoiceBlobMonthFolder(createdAt?: string | Date | null) {
  const parts = getVietnamDateTimeParts(createdAt);
  return `${parts.year4}-${parts.month}`;
}

export function formatInvoiceBlobDateFolder(createdAt?: string | Date | null) {
  const parts = getVietnamDateTimeParts(createdAt);
  return `${parts.year4}/${parts.month}/${parts.day}`;
}

function getVietnamDateTimeParts(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(safeDate);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year4: pick("year"),
    year2: pick("year").slice(-2),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute")
  };
}

export function toNumber(value: unknown) {
  return Number(value ?? 0);
}
