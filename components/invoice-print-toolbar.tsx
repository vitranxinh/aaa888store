"use client";

import { useMemo } from "react";

export function InvoicePrintToolbar({ code }: { code: string }) {
  const filename = useMemo(() => `${code.toLowerCase()}-hoa-don.pdf`, [code]);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-end gap-3 print:hidden">
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
