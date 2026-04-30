export type TimeFilterRange = "all" | "today" | "7d" | "30d" | "month" | "custom";

type RangeResult = {
  gte?: Date;
  lte?: Date;
};

const VN_OFFSET = "+07:00";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getVietnamDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
}

export function formatVietnamDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

export function parseVietnamDateInput(dateInput: string, endOfDay = false) {
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${year}-${pad(month)}-${pad(day)}T${time}${VN_OFFSET}`);
}

function shiftVietnamDate(base: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(`${base.year}-${pad(base.month)}-${pad(base.day)}T12:00:00${VN_OFFSET}`);
  shifted.setDate(shifted.getDate() + days);
  const next = getVietnamDateParts(shifted);
  return next;
}

function startOfVietnamDay(parts: { year: number; month: number; day: number }) {
  return new Date(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T00:00:00.000${VN_OFFSET}`);
}

function endOfVietnamDay(parts: { year: number; month: number; day: number }) {
  return new Date(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T23:59:59.999${VN_OFFSET}`);
}

export function resolveVietnamDateRange(range: TimeFilterRange, dateFrom?: string, dateTo?: string): RangeResult | undefined {
  const today = getVietnamDateParts();

  if (range === "all") {
    return undefined;
  }

  if (range === "custom") {
    if (!dateFrom && !dateTo) return undefined;
    return {
      gte: dateFrom ? parseVietnamDateInput(dateFrom, false) : undefined,
      lte: dateTo ? parseVietnamDateInput(dateTo, true) : undefined
    };
  }

  if (range === "today") {
    return {
      gte: startOfVietnamDay(today),
      lte: endOfVietnamDay(today)
    };
  }

  if (range === "7d") {
    const start = shiftVietnamDate(today, -6);
    return {
      gte: startOfVietnamDay(start),
      lte: endOfVietnamDay(today)
    };
  }

  if (range === "30d") {
    const start = shiftVietnamDate(today, -29);
    return {
      gte: startOfVietnamDay(start),
      lte: endOfVietnamDay(today)
    };
  }

  const monthStart = {
    year: today.year,
    month: today.month,
    day: 1
  };

  return {
    gte: startOfVietnamDay(monthStart),
    lte: endOfVietnamDay(today)
  };
}

