"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supplierSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof supplierSchema>;

type Props = {
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
    note: string | null;
    openingDebt: number;
  };
};

export function SupplierEditModal({ supplier }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  const defaultValues = useMemo<FormValues>(
    () => ({
      code: supplier.code,
      name: supplier.name,
      phone: supplier.phone || "",
      address: supplier.address || "",
      note: supplier.note || "",
      openingDebt: supplier.openingDebt
    }),
    [supplier]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật nhà cung cấp", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã cập nhật nhà cung cấp", description: payload.name });
      setOpen(false);
      window.location.reload();
    });
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Xóa nhà cung cấp "${supplier.name}"?`);
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể xóa nhà cung cấp", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã xóa nhà cung cấp", description: payload.name });
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-700 shadow-sm"
      >
        Sửa
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa nhà cung cấp</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{supplier.code}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:text-5xl">
                ×
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Mã NCC" {...form.register("code")} className="h-14 text-xl" />
                <Input placeholder="Tên nhà cung cấp" {...form.register("name")} className="h-14 text-xl" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Số điện thoại" {...form.register("phone")} className="h-14 text-xl" />
                <Input
                  type="number"
                  placeholder="Công nợ đầu kỳ"
                  {...form.register("openingDebt", { valueAsNumber: true })}
                  className="h-14 text-xl"
                />
              </div>
              <Input placeholder="Địa chỉ" {...form.register("address")} className="h-14 text-xl" />
              <textarea
                rows={4}
                placeholder="Ghi chú"
                className="rounded-2xl border border-slate-300 px-4 py-4 text-xl"
                {...form.register("note")}
              />
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white pt-4">
                <Button type="button" variant="destructive" className="h-14 text-xl" disabled={isPending} onClick={handleDelete}>
                  Xóa nhà cung cấp
                </Button>
                <Button className="h-14 text-2xl" disabled={isPending}>
                  {isPending ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
