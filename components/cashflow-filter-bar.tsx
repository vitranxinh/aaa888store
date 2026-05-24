"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  range: string;
  dateFrom: string;
  dateTo: string;
};

export function CashflowFilterBar({ range, dateFrom, dateTo }: Props) {
  const pathname = usePathname();
  const [rangeValue, setRangeValue] = useState(range);

  return (
    <form action={pathname} className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <select
        name="range"
        value={rangeValue}
        onChange={(event) => {
          setRangeValue(event.target.value);
        }}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:w-auto sm:text-lg"
      >
        <option value="all">Tất cả thời gian</option>
        <option value="today">Hôm nay</option>
        <option value="7d">7 ngày</option>
        <option value="30d">30 ngày</option>
        <option value="month">Tháng này</option>
        <option value="custom">Tùy chọn ngày</option>
      </select>
      <input
        type="date"
        name="dateFrom"
        defaultValue={dateFrom}
        disabled={rangeValue !== "custom"}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-14 sm:w-auto sm:text-lg"
      />
      <input
        type="date"
        name="dateTo"
        defaultValue={dateTo}
        disabled={rangeValue !== "custom"}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-14 sm:w-auto sm:text-lg"
      />
      <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg">
        Lọc
      </button>
    </form>
  );
}
