"use client";

import { useEffect } from "react";
import { useToastStore } from "@/store/toast-store";

export function Toaster() {
  const { toasts, remove } = useToastStore();

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        remove(toast.id);
      }, 3200)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, remove]);

  return (
    <div className="fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border px-4 py-3 shadow-soft ${
            toast.variant === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <p className="font-semibold">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-sm">{toast.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
