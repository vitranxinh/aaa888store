"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Input } from "@/components/ui/input";
import { customerSchema } from "@/lib/validations";
import { formatCustomerDebt } from "@/lib/utils";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof customerSchema>;

type Props = {
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    note: string | null;
    groupId: string | null;
    openingDebt: number;
    currentDebt: number;
  };
  groups: { id: string; name: string }[];
};

export function CustomerEditModal({ customer, groups }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [currentDebtValue, setCurrentDebtValue] = useState(customer.currentDebt);
  const pushToast = useToastStore((state) => state.push);
  const orderDebt = customer.currentDebt - customer.openingDebt;

  const defaultValues = useMemo<FormValues>(
    () => ({
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
      note: customer.note || "",
      groupId: customer.groupId || "",
      openingDebt: customer.openingDebt,
    }),
    [customer]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const normalizedCurrentDebt = Number.isFinite(currentDebtValue) ? currentDebtValue : 0;
      const nextOpeningDebt = normalizedCurrentDebt - orderDebt;
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          openingDebt: nextOpeningDebt
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật khách hàng", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã cập nhật khách hàng", description: payload.name });
      setOpen(false);
      router.refresh();
    });
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Xóa khách hàng "${customer.name}"?`);
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể xóa khách hàng", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã xóa khách hàng", description: payload.name });
      setOpen(false);
      router.refresh();
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
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa khách hàng</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{customer.code}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:text-5xl">
                ×
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Mã khách hàng" {...form.register("code")} className="h-14 text-xl" />
                <Input placeholder="Tên khách hàng" {...form.register("name")} className="h-14 text-xl" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Số điện thoại" {...form.register("phone")} className="h-14 text-xl" />
                <Input placeholder="Email" {...form.register("email")} className="h-14 text-xl" />
              </div>
              <Input placeholder="Địa chỉ" {...form.register("address")} className="h-14 text-xl" />
              <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("groupId")}>
                <option value="">Chọn nhóm khách</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Công nợ hiện tại</p>
                <p className={`mt-2 text-3xl font-bold ${currentDebtValue > 0 ? "text-red-600" : currentDebtValue < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                  {formatCustomerDebt(currentDebtValue)}
                </p>
              </div>
              <FormattedNumberInput
                placeholder="Công nợ hiện tại"
                value={currentDebtValue}
                onValueChange={setCurrentDebtValue}
                allowNegative
                className="h-14 text-xl"
              />
              <p className="-mt-2 text-sm text-slate-500">
                Nhập số công nợ cuối cùng muốn hiển thị cho khách hàng. Hệ thống sẽ tự quy đổi phần điều chỉnh nền.
              </p>
              <textarea
                rows={4}
                placeholder="Ghi chú"
                className="rounded-2xl border border-slate-300 px-4 py-4 text-xl"
                {...form.register("note")}
              />
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white pt-4">
                <Button type="button" variant="destructive" className="h-14 text-xl" loading={isPending} onClick={handleDelete}>
                  Xóa khách hàng
                </Button>
                <Button className="h-14 text-2xl" loading={isPending}>
                  Lưu thay đổi
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
