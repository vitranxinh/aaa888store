"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supplierSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof supplierSchema>;

export function SupplierCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { code: "", name: "", phone: "", address: "", note: "", openingDebt: 0 }
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm nhà cung cấp", description: payload.error, variant: "error" });
        return;
      }
      form.reset();
      pushToast({ title: "Đã thêm nhà cung cấp", description: payload.name });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardTitle>Tạo nhà cung cấp</CardTitle>
      <CardDescription className="mt-1">Thêm NCC để dùng ngay cho nhập hàng và chi tiền.</CardDescription>
      <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Mã NCC" {...form.register("code")} />
          <Input placeholder="Tên nhà cung cấp" {...form.register("name")} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Số điện thoại" {...form.register("phone")} />
          <Input type="number" placeholder="Công nợ đầu kỳ" {...form.register("openingDebt", { valueAsNumber: true })} />
        </div>
        <Input placeholder="Địa chỉ" {...form.register("address")} />
        <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Ghi chú" {...form.register("note")} />
        <Button loading={isPending}>Thêm nhà cung cấp</Button>
      </form>
    </Card>
  );
}
