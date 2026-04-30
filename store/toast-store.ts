"use client";

import { create } from "zustand";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error";
};

function createToastId() {
  if (typeof globalThis !== "undefined" && "crypto" in globalThis && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type ToastStore = {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: createToastId() }]
    })),
  remove: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    }))
}));
