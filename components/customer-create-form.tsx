"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { customerSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type Props = {
  groups: { id: string; name: string }[];
};

type FormValues = z.infer<typeof customerSchema>;

export function CustomerCreateForm({ groups }: Props) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { code: "", name: "", phone: "", email: "", address: "", note: "", groupId: "", openingDebt: 0 }
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm khách hàng", description: payload.error, variant: "error" });
        return;
      }
      form.reset();
      pushToast({ title: "Đã thêm khách hàng", description: payload.name });
      window.location.reload();
    });
  }

  return (
    <Card>
      <CardTitle>Tạo khách hàng</CardTitle>
      <CardDescription className="mt-1">Thêm khách mới để dùng ngay trên màn hình POS.</CardDescription>
      <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Mã khách hàng" {...form.register("code")} />
          <Input placeholder="Tên khách hàng" {...form.register("name")} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Số điện thoại" {...form.register("phone")} />
          <Input placeholder="Email" {...form.register("email")} />
        </div>
        <Input placeholder="Địa chỉ" {...form.register("address")} />
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("groupId")}>
          <option value="">Chọn nhóm khách</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Ghi chú" {...form.register("note")} />
        <Button disabled={isPending}>{isPending ? "Đang lưu..." : "Thêm khách hàng"}</Button>
      </form>
    </Card>
  );
}
