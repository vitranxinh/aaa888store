"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inventoryAdjustmentSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type Props = {
  branches: { id: string; name: string }[];
  products: { id: string; name: string }[];
  defaultBranchId?: string | null;
};

type FormValues = z.infer<typeof inventoryAdjustmentSchema>;

export function InventoryAdjustForm({ branches, products, defaultBranchId }: Props) {
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(inventoryAdjustmentSchema),
    defaultValues: {
      branchId: defaultBranchId ?? branches[0]?.id ?? "",
      productId: products[0]?.id ?? "",
      type: "IMPORT",
      quantity: 1,
      note: "",
      referenceCode: ""
    }
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật kho", description: payload.error, variant: "error" });
        return;
      }
      pushToast({ title: "Đã cập nhật kho", description: "Tồn kho và nhật ký đã được ghi nhận" });
      window.location.reload();
    });
  }

  return (
    <Card>
      <CardTitle>Điều chỉnh kho</CardTitle>
      <CardDescription className="mt-1">Nhập, xuất hoặc điều chỉnh số lượng nhanh cho từng chi nhánh.</CardDescription>
      <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("branchId")}>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("productId")}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <div className="grid gap-3 md:grid-cols-2">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("type")}>
            <option value="IMPORT">Nhập kho</option>
            <option value="EXPORT">Xuất kho</option>
            <option value="ADJUSTMENT">Điều chỉnh</option>
            <option value="TRANSFER_OUT">Chuyển đi</option>
            <option value="TRANSFER_IN">Nhận chuyển</option>
          </select>
          <Input type="number" {...form.register("quantity", { valueAsNumber: true })} />
        </div>
        <Input placeholder="Mã tham chiếu" {...form.register("referenceCode")} />
        <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Ghi chú" {...form.register("note")} />
        <Button disabled={isPending}>{isPending ? "Đang cập nhật..." : "Lưu giao dịch kho"}</Button>
      </form>
    </Card>
  );
}
