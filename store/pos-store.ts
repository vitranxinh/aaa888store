"use client";

import { create } from "zustand";
import { calculateCartTotals } from "@/lib/pos";

export type PosCartItem = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountValue: number;
  stock: number;
};

type PosStore = {
  items: PosCartItem[];
  customerId?: string;
  branchId?: string;
  orderDiscount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "MIXED";
  paidAmount: number;
  note: string;
  addItem: (item: PosCartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discountValue: number) => void;
  updatePrice: (productId: string, unitPrice: number) => void;
  removeItem: (productId: string) => void;
  setCustomer: (customerId?: string) => void;
  setBranch: (branchId?: string) => void;
  setOrderDiscount: (value: number) => void;
  setPaymentMethod: (method: PosStore["paymentMethod"]) => void;
  setPaidAmount: (value: number) => void;
  setNote: (value: string) => void;
  clear: () => void;
};

const initialState = {
  items: [],
  customerId: undefined,
  branchId: undefined,
  orderDiscount: 0,
  paymentMethod: "CASH" as const,
  paidAmount: 0,
  note: ""
};

export const usePosStore = create<PosStore>((set, get) => ({
  ...initialState,
  addItem: (item) => {
    const existing = get().items.find((line) => line.productId === item.productId);
    if (existing) {
      set({
        items: get().items.map((line) =>
          line.productId === item.productId
            ? { ...line, quantity: Math.min(line.quantity + 1, line.stock) }
            : line
        )
      });
      return;
    }
    set({ items: [...get().items, item] });
  },
  updateQuantity: (productId, quantity) =>
    set({
      items: get().items.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    }),
  updateDiscount: (productId, discountValue) =>
    set({
      items: get().items.map((item) => (item.productId === productId ? { ...item, discountValue } : item))
    }),
  updatePrice: (productId, unitPrice) =>
    set({
      items: get().items.map((item) => (item.productId === productId ? { ...item, unitPrice } : item))
    }),
  removeItem: (productId) => set({ items: get().items.filter((item) => item.productId !== productId) }),
  setCustomer: (customerId) => set({ customerId }),
  setBranch: (branchId) => set({ branchId }),
  setOrderDiscount: (orderDiscount) => set({ orderDiscount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setPaidAmount: (paidAmount) => set({ paidAmount }),
  setNote: (note) => set({ note }),
  clear: () => set(initialState)
}));

export function usePosTotals() {
  return usePosStore((state) => calculateCartTotals(state.items, state.orderDiscount));
}
