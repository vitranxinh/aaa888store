"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toast-store";

type Props = {
  categories?: { id: string; name: string }[];
  brands?: { id: string; name: string }[];
};

export function ProductCreateForm({ categories = [], brands = [] }: Props) {
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
  const [sellingPrice, setSellingPrice] = useState<number | "">(0);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [costPrice, setCostPrice] = useState<number | "">(0);
  const [lowStockAlert, setLowStockAlert] = useState<number | "">(10);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [description, setDescription] = useState("");
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
    setBarcode("");
    setImageUrl("");
    setImagePreview("");
    setCategoryId("");
    setBrandId("");
    setCostPrice(0);
    setLowStockAlert(10);
    setStatus("ACTIVE");
    setDescription("");
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
          sellingPrice: typeof sellingPrice === "number" ? sellingPrice : Number(sellingPrice || 0),
          sku: sku.trim(),
          barcode: barcode.trim(),
          imageUrl: imageUrl.trim(),
          categoryId,
          brandId,
          costPrice: typeof costPrice === "number" ? costPrice : Number(costPrice || 0),
          lowStockAlert: typeof lowStockAlert === "number" ? lowStockAlert : Number(lowStockAlert || 10),
          status,
          description: description.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({ title: "Không thể thêm sản phẩm", description: payload.error, variant: "error" });
        return;
      }
      resetForm();
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
      setImageUrl(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardTitle>Tạo sản phẩm</CardTitle>
      <CardDescription className="mt-1">Giữ form đầy đủ như cũ, nhưng chỉ cần điền tên sản phẩm và giá bán. Các ô còn lại là tùy chọn.</CardDescription>
      <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">Tên sản phẩm</span>
          <span className="text-xs text-slate-500">Bắt buộc</span>
          <Input placeholder="Tên sản phẩm" value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">SKU</span>
            <span className="text-xs text-slate-500">Tùy chọn, để trống hệ thống tự tạo</span>
            <Input placeholder="SKU" value={sku} onChange={(event) => setSku(event.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Barcode</span>
            <span className="text-xs text-slate-500">Tùy chọn</span>
            <Input placeholder="Barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">Ảnh sản phẩm URL</span>
          <span className="text-xs text-slate-500">Tùy chọn</span>
          <Input placeholder="Ảnh sản phẩm URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">Upload ảnh</span>
          <span className="text-xs text-slate-500">Tùy chọn</span>
          <input type="file" accept="image/*" onChange={handleFileChange} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </label>

        {imagePreview || imageUrl ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview || imageUrl} alt="preview" className="h-28 w-28 rounded-xl object-cover" />
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Danh mục</span>
            <span className="text-xs text-slate-500">Tùy chọn</span>
            <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Chọn danh mục</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-left text-xs font-semibold text-emerald-700"
              onClick={() => setShowCategoryCreator((prev) => !prev)}
            >
              + Thêm danh mục mới
            </button>
            {showCategoryCreator ? (
              <div className="flex gap-2">
                <Input placeholder="Tên danh mục mới" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                <Button type="button" className="shrink-0" disabled={isAddingCategory} onClick={createCategory}>
                  {isAddingCategory ? "Đang thêm..." : "Thêm"}
                </Button>
              </div>
            ) : null}
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Thương hiệu</span>
            <span className="text-xs text-slate-500">Tùy chọn</span>
            <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="">Chọn thương hiệu</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-left text-xs font-semibold text-emerald-700"
              onClick={() => setShowBrandCreator((prev) => !prev)}
            >
              + Thêm thương hiệu mới
            </button>
            {showBrandCreator ? (
              <div className="flex gap-2">
                <Input placeholder="Tên thương hiệu mới" value={newBrandName} onChange={(event) => setNewBrandName(event.target.value)} />
                <Button type="button" className="shrink-0" disabled={isAddingBrand} onClick={createBrand}>
                  {isAddingBrand ? "Đang thêm..." : "Thêm"}
                </Button>
              </div>
            ) : null}
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Giá vốn</span>
            <span className="text-xs text-slate-500">Tùy chọn</span>
            <Input type="number" placeholder="Giá vốn" value={costPrice} onChange={(event) => setCostPrice(event.target.value === "" ? "" : Number(event.target.value))} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Giá bán</span>
            <span className="text-xs text-slate-500">Bắt buộc</span>
            <Input type="number" placeholder="Giá bán" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value === "" ? "" : Number(event.target.value))} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">Ngưỡng tồn</span>
            <span className="text-xs text-slate-500">Tùy chọn</span>
            <Input type="number" placeholder="Ngưỡng tồn" value={lowStockAlert} onChange={(event) => setLowStockAlert(event.target.value === "" ? "" : Number(event.target.value))} />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">Trạng thái</span>
          <span className="text-xs text-slate-500">Tùy chọn</span>
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")}>
            <option value="ACTIVE">Đang bán</option>
            <option value="INACTIVE">Ngưng bán</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">Mô tả</span>
          <span className="text-xs text-slate-500">Tùy chọn</span>
          <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Mô tả" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        <Button disabled={isPending || !name.trim()}>
          {isPending ? "Đang lưu..." : "Thêm sản phẩm"}
        </Button>
      </form>
    </Card>
  );
}
