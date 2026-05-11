"use client";

import { useEffect, useState } from "react";
import { CustomerCreateForm } from "@/components/customer-create-form";

export function CustomerCreateLauncher({
  groups
}: {
  groups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [canInteract, setCanInteract] = useState(false);

  useEffect(() => {
    if (!open) {
      setCanInteract(false);
      return;
    }

    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const timer = window.setTimeout(() => {
      setCanInteract(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => {
          setCanInteract(false);
          setOpen(true);
        }}
        className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-soft sm:px-6 sm:py-4 sm:text-2xl"
      >
        + Thêm KH
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Đóng thêm khách hàng"
            className="fixed inset-0 z-40 bg-black/35 sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className={`fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-20 sm:w-[92vw] sm:max-w-[460px] sm:rounded-[28px] sm:border sm:border-slate-200 ${canInteract ? "" : "pointer-events-none"}`}
          >
            <div className="mb-3 flex items-center justify-between sm:hidden">
              <p className="text-base font-semibold text-slate-900">Thêm khách hàng</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-3xl leading-none text-slate-500"
              >
                ×
              </button>
            </div>
            <CustomerCreateForm groups={groups} />
          </div>
        </>
      ) : null}
    </div>
  );
}
