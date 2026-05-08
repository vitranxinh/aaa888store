"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toast-store";

type Props = {
  categories?: { id: string; name: string }[];
  brands?: { id: string; name: string }[];
};

export function ProductCreateForm({ categories = [], brands = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [brandOptions, setBrandOptions] = useState(brands);
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [showBrandCreator, setShowBrandCreator] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState(0);
  const [sku, setSku] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [initialStockQuantity, setInitialStockQuantity] = useState(0);
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
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

    if (categories.length === 0 || brands.length === 0) {
      loadOptions();
    }

    return () => {
      ignore = true;
    };
  }, [brands.length, categories.length]);

  function resetForm() {
    setName("");
    setSellingPrice(0);
    setSku("");
    setImageUrl("");
    setImagePreview("");
    setCategoryId("");
    setBrandId("");
    setInitialStockQuantity(0);
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
      setCategoryId(payload.id);
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
      setBrandId(payload.id);
      setNewBrandName("");
      setShowBrandCreator(false);
      pushToast({ title: "Đã thêm thương hiệu", description: payload.name });
    } finally {
      setIsAddingBrand(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sellingPrice,
          sku: sku.trim(),
          imageUrl: imageUrl.trim(),
          categoryId,
          brandId,
          initialStockQuantity
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm sản phẩm", description: payload.error, variant: "error" });
        return;
      }
      resetForm();
      pushToast({ title: "Đã thêm sản phẩm", description: payload.name });
      router.refresh();
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setImageUrl(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="min-w-0 w-full max-w-full overflow-x-hidden p-4 sm:p-5">
      <CardTitle>Tạo sản phẩm</CardTitle>
      <CardDescription className="mt-1">Tạo sản phẩm và nhập tồn ban đầu ngay trong một form.</CardDescription>
      <form className="mt-4 grid min-w-0 gap-5" onSubmit={onSubmit}>
        <section className="grid min-w-0 gap-3">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Thông tin sản phẩm</h4>
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Tên sản phẩm</span>
            <Input placeholder="Tên sản phẩm" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Mã sản phẩm / SKU</span>
              <span className="text-xs text-slate-500">Để trống nếu muốn hệ thống tự tạo</span>
              <Input placeholder="SKU" value={sku} onChange={(event) => setSku(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Giá bán</span>
              <FormattedNumberInput
                min={0}
                value={sellingPrice}
                onValueChange={setSellingPrice}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Giá bán"
              />
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Ảnh sản phẩm URL</span>
            <Input placeholder="Ảnh sản phẩm URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Upload ảnh</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          {imagePreview || imageUrl ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview || imageUrl} alt="preview" className="h-28 w-28 rounded-xl object-cover" />
            </div>
          ) : null}

          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Danh mục</span>
              <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Chọn danh mục</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button type="button" className="text-left text-xs font-semibold text-emerald-700" onClick={() => setShowCategoryCreator((prev) => !prev)}>
                + Thêm danh mục mới
              </button>
              {showCategoryCreator ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Input placeholder="Tên danh mục mới" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                  <Button type="button" className="w-full shrink-0 sm:w-auto" loading={isAddingCategory} onClick={createCategory}>
                    Thêm
                  </Button>
                </div>
              ) : null}
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Thương hiệu</span>
              <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="">Chọn thương hiệu</option>
                {brandOptions.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <button type="button" className="text-left text-xs font-semibold text-emerald-700" onClick={() => setShowBrandCreator((prev) => !prev)}>
                + Thêm thương hiệu mới
              </button>
              {showBrandCreator ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Input placeholder="Tên thương hiệu mới" value={newBrandName} onChange={(event) => setNewBrandName(event.target.value)} />
                  <Button type="button" className="w-full shrink-0 sm:w-auto" loading={isAddingBrand} onClick={createBrand}>
                    Thêm
                  </Button>
                </div>
              ) : null}
            </label>
          </div>
        </section>

        <section className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Hàng tồn</h4>
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Nhập tồn ban đầu</span>
            <FormattedNumberInput
              min={0}
              value={initialStockQuantity}
              onValueChange={setInitialStockQuantity}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Số lượng tồn"
            />
          </label>
        </section>

        <Button loading={isPending} className="w-full sm:w-auto">Lưu sản phẩm</Button>
      </form>
    </Card>
  );
}
