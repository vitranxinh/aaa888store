"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  q: string;
  range: string;
  dateFrom: string;
  dateTo: string;
  canExport?: boolean;
};

export function OrdersFilterBar({ q, range, dateFrom, dateTo, canExport = true }: Props) {
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [rangeValue, setRangeValue] = useState(range);
  const [queryValue, setQueryValue] = useState(q);

  function submitForm() {
    formRef.current?.requestSubmit();
  }

  useEffect(() => {
    setQueryValue(q);
  }, [q]);

  return (
    <form ref={formRef} action={pathname} className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <input
        name="q"
        value={queryValue}
        onChange={(event) => setQueryValue(event.target.value)}
        placeholder="Tìm theo mã HĐ, tên khách..."
        className="h-11 w-full min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base shadow-soft outline-none sm:h-14 sm:min-w-[280px] sm:px-5 sm:text-xl"
      />
      <select
        name="range"
        value={rangeValue}
        onChange={(event) => {
          const nextRange = event.target.value;
          setRangeValue(nextRange);
          if (nextRange !== "custom") {
            submitForm();
          }
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
        onChange={() => submitForm()}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-14 sm:w-auto sm:text-lg"
      />
      <input
        type="date"
        name="dateTo"
        defaultValue={dateTo}
        disabled={rangeValue !== "custom"}
        onChange={() => submitForm()}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-14 sm:w-auto sm:text-lg"
      />
      <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg">
        Lọc
      </button>
      {canExport ? (
        <a
          href={`/api/orders/export?q=${encodeURIComponent(q)}&range=${encodeURIComponent(range)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg"
        >
          Xuất Excel
        </a>
      ) : null}
    </form>
  );
}
