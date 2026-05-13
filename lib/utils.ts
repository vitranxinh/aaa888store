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

export function toNumber(value: unknown) {
  return Number(value ?? 0);
}
