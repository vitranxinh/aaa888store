"use client";

import { ChangeEvent, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof productSchema>;

type Props = {
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    imageUrl: string | null;
    categoryId: string | null;
    brandId: string | null;
    costPrice: number;
    sellingPrice: number;
    lowStockAlert: number;
    status: "ACTIVE" | "INACTIVE";
    description: string | null;
  };
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  canDelete?: boolean;
};

export function ProductEditModal({ product, categories, brands, canDelete = false }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imagePreview, setImagePreview] = useState(product.imageUrl || "");
  const pushToast = useToastStore((state) => state.push);

  const defaultValues = useMemo<FormValues>(
    () => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || "",
      imageUrl: product.imageUrl || "",
      categoryId: product.categoryId || "",
      brandId: product.brandId || "",
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      lowStockAlert: product.lowStockAlert,
      status: product.status,
      description: product.description || ""
    }),
    [product]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues
  });

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

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật sản phẩm", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã cập nhật sản phẩm", description: payload.name });
      setOpen(false);
      window.location.reload();
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(`Xóa sản phẩm "${product.name}"?`);
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể xóa sản phẩm", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã xóa sản phẩm", description: payload.name ?? product.name });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-4xl font-bold text-slate-900">Sửa sản phẩm</h3>
                <p className="mt-1 text-base text-slate-500">{product.sku}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-5xl leading-none text-slate-500">
                ×
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <Input placeholder="Tên sản phẩm" {...form.register("name")} className="h-14 text-xl" />
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="SKU" {...form.register("sku")} className="h-14 text-xl" />
                <Input placeholder="Barcode" {...form.register("barcode")} className="h-14 text-xl" />
              </div>
              <Input placeholder="Ảnh sản phẩm URL" {...form.register("imageUrl")} className="h-14 text-xl" />
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="rounded-2xl border border-slate-300 px-4 py-4 text-base"
              />
              {imagePreview || form.watch("imageUrl") ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview || form.watch("imageUrl")}
                    alt={form.watch("name")}
                    className="h-28 w-28 rounded-xl object-cover"
                  />
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("categoryId")}>
                  <option value="">Chọn danh mục</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("brandId")}>
                  <option value="">Chọn thương hiệu</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Input type="number" placeholder="Giá vốn" {...form.register("costPrice", { valueAsNumber: true })} className="h-14 text-xl" />
                <Input
                  type="number"
                  placeholder="Giá bán"
                  {...form.register("sellingPrice", { valueAsNumber: true })}
                  className="h-14 text-xl"
                />
                <Input
                  type="number"
                  placeholder="Ngưỡng cảnh báo"
                  {...form.register("lowStockAlert", { valueAsNumber: true })}
                  className="h-14 text-xl"
                />
              </div>
              <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("status")}>
                <option value="ACTIVE">Đang bán</option>
                <option value="INACTIVE">Ngưng bán</option>
              </select>
              <textarea
                rows={4}
                placeholder="Mô tả sản phẩm"
                className="rounded-2xl border border-slate-300 px-4 py-4 text-xl"
                {...form.register("description")}
              />
              <div className="flex flex-col gap-3 md:flex-row">
                <Button className="h-14 flex-1 text-2xl" disabled={isPending}>
                  {isPending ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="h-14 rounded-2xl border border-red-200 bg-red-50 px-6 text-2xl font-semibold text-red-600 disabled:opacity-60"
                  >
                    {isPending ? "Đang xử lý..." : "Xóa sản phẩm"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
