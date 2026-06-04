"use client";

import { useMemo } from "react";

export function InvoicePrintToolbar({ code, showOldDebt }: { code: string; showOldDebt: boolean }) {
  const filename = useMemo(() => `${code.toLowerCase()}-hoa-don.pdf`, [code]);

  function toggleOldDebt(nextValue: boolean) {
    const url = new URL(window.location.href);
    url.searchParams.set("showOldDebt", nextValue ? "1" : "0");
    window.location.href = url.toString();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-end gap-3 print:hidden">
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={showOldDebt}
          onChange={(event) => toggleOldDebt(event.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
        Hiện nợ cũ
      </label>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
      >
        Xuất PDF
      </button>
      <a
        href="#"
        download={filename}
        onClick={(event) => {
          event.preventDefault();
          window.print();
        }}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
      >
        In hóa đơn
      </a>
    </div>
  );
}
