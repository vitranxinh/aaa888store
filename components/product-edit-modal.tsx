"use client";

import { ChangeEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Input } from "@/components/ui/input";
import { productUpdateSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof productUpdateSchema>;

type Props = {
  product: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    categoryId: string | null;
    brandId: string | null;
    sellingPrice: number;
  };
  categories?: { id: string; name: string }[];
  brands?: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  defaultBranchId?: string | null;
  currentQuantity: number;
  currentBranchName: string;
  canDelete?: boolean;
};

export function ProductEditModal({
  product,
  categories = [],
  brands = [],
  branches,
  defaultBranchId,
  currentQuantity,
  currentBranchName,
  canDelete = false
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [imagePreview, setImagePreview] = useState(product.imageUrl || "");
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [brandOptions, setBrandOptions] = useState(brands);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [showBrandCreator, setShowBrandCreator] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const pushToast = useToastStore((state) => state.push);

  const defaultValues = useMemo<FormValues>(
    () => ({
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl || "",
      categoryId: product.categoryId || "",
      brandId: product.brandId || "",
      sellingPrice: product.sellingPrice,
      stockAdjustmentQuantity: 0,
      stockBranchId: defaultBranchId || "",
      stockNote: ""
    }),
    [defaultBranchId, product]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(productUpdateSchema),
    defaultValues
  });

  useEffect(() => {
    if (!open) return;
    let ignore = false;

    async function loadOptions() {
      try {
        const [categoriesResponse, brandsResponse] = await Promise.all([
          fetch("/api/categories", { credentials: "same-origin" }),
          fetch("/api/brands", { credentials: "same-origin" })
        ]);

        if (!categoriesResponse.ok || !brandsResponse.ok || ignore) return;

        const [categoriesPayload, brandsPayload] = await Promise.all([
          categoriesResponse.json(),
          brandsResponse.json()
        ]);

        if (!ignore) {
          setCategoryOptions(Array.isArray(categoriesPayload) ? categoriesPayload : []);
          setBrandOptions(Array.isArray(brandsPayload) ? brandsPayload : []);
        }
      } catch {
        // keep existing options
      }
    }

    if (categoryOptions.length === 0 || brandOptions.length === 0) {
      loadOptions();
    }

    return () => {
      ignore = true;
    };
  }, [open, categoryOptions.length, brandOptions.length]);

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
      form.reset({
        ...values,
        stockAdjustmentQuantity: 0,
        stockNote: ""
      });
      router.refresh();
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
      router.refresh();
    });
  }

  async function createCategory() {
    const categoryName = newCategoryName.trim();
    if (categoryName.length < 2) {
      pushToast({ title: "Không thể thêm danh mục", description: "Tên danh mục phải có ít nhất 2 ký tự.", variant: "error" });
      return;
    }

    setIsAddingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm danh mục", description: payload.error, variant: "error" });
        return;
      }
      setCategoryOptions((prev) => (prev.some((item) => item.id === payload.id) ? prev : [...prev, payload]));
      form.setValue("categoryId", payload.id, { shouldDirty: true });
      setNewCategoryName("");
      setShowCategoryCreator(false);
      pushToast({ title: "Đã thêm danh mục", description: payload.name });
    } finally {
      setIsAddingCategory(false);
    }
  }

  async function createBrand() {
    const brandName = newBrandName.trim();
    if (brandName.length < 2) {
      pushToast({ title: "Không thể thêm thương hiệu", description: "Tên thương hiệu phải có ít nhất 2 ký tự.", variant: "error" });
      return;
    }

    setIsAddingBrand(true);
    try {
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: brandName })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm thương hiệu", description: payload.error, variant: "error" });
        return;
      }
      setBrandOptions((prev) => (prev.some((item) => item.id === payload.id) ? prev : [...prev, payload]));
      form.setValue("brandId", payload.id, { shouldDirty: true });
      setNewBrandName("");
      setShowBrandCreator(false);
      pushToast({ title: "Đã thêm thương hiệu", description: payload.name });
    } finally {
      setIsAddingBrand(false);
    }
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
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa sản phẩm</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{product.sku}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:text-5xl">
                ×
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-5">
                <section className="grid gap-4">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Thông tin sản phẩm</h4>

                  <Input placeholder="Tên sản phẩm" {...form.register("name")} className="h-14 text-xl" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="SKU" {...form.register("sku")} className="h-14 text-xl" />
                    <FormattedNumberInput
                      placeholder="Giá bán"
                      min={0}
                      value={Number(form.watch("sellingPrice") ?? 0)}
                      onValueChange={(value) => form.setValue("sellingPrice", value, { shouldDirty: true })}
                      className="h-14 text-xl"
                    />
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
                    <div className="grid gap-2">
                      <select
                        className="h-14 rounded-2xl border border-slate-300 px-4 text-xl"
                        value={form.watch("categoryId")}
                        onChange={(event) => form.setValue("categoryId", event.target.value, { shouldDirty: true })}
                      >
                        <option value="">Chọn danh mục</option>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="text-left text-sm font-semibold text-emerald-700" onClick={() => setShowCategoryCreator((prev) => !prev)}>
                        + Thêm danh mục mới
                      </button>
                      {showCategoryCreator ? (
                        <div className="flex gap-2">
                          <Input placeholder="Tên danh mục mới" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} className="h-12 text-base" />
                          <Button type="button" className="shrink-0" loading={isAddingCategory} onClick={createCategory}>
                            Thêm
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-2">
                      <select
                        className="h-14 rounded-2xl border border-slate-300 px-4 text-xl"
                        value={form.watch("brandId")}
                        onChange={(event) => form.setValue("brandId", event.target.value, { shouldDirty: true })}
                      >
                        <option value="">Chọn thương hiệu</option>
                        {brandOptions.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="text-left text-sm font-semibold text-emerald-700" onClick={() => setShowBrandCreator((prev) => !prev)}>
                        + Thêm thương hiệu mới
                      </button>
                      {showBrandCreator ? (
                        <div className="flex gap-2">
                          <Input placeholder="Tên thương hiệu mới" value={newBrandName} onChange={(event) => setNewBrandName(event.target.value)} className="h-12 text-base" />
                          <Button type="button" className="shrink-0" loading={isAddingBrand} onClick={createBrand}>
                            Thêm
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Hàng tồn</h4>

                  <div className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Số lượng tồn</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{currentQuantity}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">Kho / chi nhánh hiện tại</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{currentBranchName}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-slate-700">Cập nhật tồn kho</span>
                      <FormattedNumberInput
                        min={0}
                        value={Number(form.watch("stockAdjustmentQuantity") ?? 0)}
                        onValueChange={(value) => form.setValue("stockAdjustmentQuantity", value, { shouldDirty: true })}
                        className="h-14 text-xl"
                        placeholder="Nhập thêm tồn"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-slate-700">Kho / chi nhánh</span>
                      <select
                        className="h-14 rounded-2xl border border-slate-300 px-4 text-xl"
                        value={form.watch("stockBranchId")}
                        onChange={(event) => form.setValue("stockBranchId", event.target.value, { shouldDirty: true })}
                      >
                        <option value="">Chọn kho / chi nhánh</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-slate-700">Ghi chú</span>
                    <textarea
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-lg"
                      rows={3}
                      placeholder="Ghi chú cập nhật tồn kho"
                      value={form.watch("stockNote")}
                      onChange={(event) => form.setValue("stockNote", event.target.value, { shouldDirty: true })}
                    />
                  </label>
                </section>
              </div>

              <div className="sticky bottom-0 z-10 mt-6 flex justify-between gap-3 border-t border-slate-100 bg-white px-0 py-4">
                {canDelete ? (
                  <Button variant="destructive" type="button" onClick={handleDelete} loading={isPending}>
                    Xóa sản phẩm
                  </Button>
                ) : <span />}
                <Button loading={isPending}>Lưu thay đổi</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
