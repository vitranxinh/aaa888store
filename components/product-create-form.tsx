"use client";

import { ChangeEvent, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { productSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type Props = {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
};

type FormValues = z.infer<typeof productSchema>;

export function ProductCreateForm({ categories, brands }: Props) {
  const [isPending, startTransition] = useTransition();
  const [imagePreview, setImagePreview] = useState("");
  const pushToast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      categoryId: "",
      brandId: "",
      imageUrl: "",
      costPrice: 0,
      sellingPrice: 0,
      lowStockAlert: 10,
      status: "ACTIVE",
      description: ""
    }
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm sản phẩm", description: payload.error, variant: "error" });
        return;
      }
      form.reset();
      pushToast({ title: "Đã thêm sản phẩm", description: payload.name });
      window.location.reload();
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      form.setValue("imageUrl", result, { shouldDirty: true });
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardTitle>Tạo sản phẩm</CardTitle>
      <CardDescription className="mt-1">Form nhanh để thêm hàng mới vào danh mục.</CardDescription>
      <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <Input placeholder="Tên sản phẩm" {...form.register("name")} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="SKU" {...form.register("sku")} />
          <Input placeholder="Barcode" {...form.register("barcode")} />
        </div>
        <Input placeholder="Ảnh sản phẩm URL" {...form.register("imageUrl")} />
        <input type="file" accept="image/*" onChange={handleFileChange} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        {imagePreview || form.watch("imageUrl") ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview || form.watch("imageUrl")} alt="preview" className="h-28 w-28 rounded-xl object-cover" />
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("categoryId")}>
            <option value="">Chọn danh mục</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("brandId")}>
            <option value="">Chọn thương hiệu</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Input type="number" placeholder="Giá vốn" {...form.register("costPrice", { valueAsNumber: true })} />
          <Input type="number" placeholder="Giá bán" {...form.register("sellingPrice", { valueAsNumber: true })} />
          <Input type="number" placeholder="Ngưỡng tồn" {...form.register("lowStockAlert", { valueAsNumber: true })} />
        </div>
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" {...form.register("status")}>
          <option value="ACTIVE">Đang bán</option>
          <option value="INACTIVE">Ngưng bán</option>
        </select>
        <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Mô tả" {...form.register("description")} />
        <Button disabled={isPending}>{isPending ? "Đang lưu..." : "Thêm sản phẩm"}</Button>
      </form>
    </Card>
  );
}
