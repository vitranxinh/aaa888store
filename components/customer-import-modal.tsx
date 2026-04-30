"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toast-store";

export function CustomerImportModal() {
  const [open, setOpen] = useState(false);
  const [xlsxPath, setXlsxPath] = useState("/Users/vitran/Downloads/302.xlsx");
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const pushToast = useToastStore((state) => state.push);

  function submit() {
    startTransition(async () => {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      } else {
        formData.append("xlsxPath", xlsxPath);
      }

      const response = await fetch("/api/customers/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Import khách hàng thất bại", description: payload.error, variant: "error" });
        return;
      }

      pushToast({
        title: "Đã import khách hàng",
        description: `${payload.imported} khách hàng từ ${payload.source}`,
      });
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-slate-300 bg-white px-6 py-4 text-2xl font-semibold text-slate-700 shadow-soft"
      >
        Import Excel
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-4xl font-bold text-slate-900">Import khách hàng từ Excel</h3>
              <button onClick={() => setOpen(false)} className="text-5xl text-slate-500">
                ×
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-xl font-semibold text-slate-900">Đường dẫn file Excel</label>
              <Input value={xlsxPath} onChange={(e) => setXlsxPath(e.target.value)} className="h-14 text-xl" />
              <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                <label className="block text-lg font-semibold text-slate-900">Hoặc chọn file Excel trực tiếp</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="mt-3 block w-full text-sm text-slate-600"
                />
                <p className="mt-2 text-sm text-slate-500">{file ? `Đã chọn: ${file.name}` : "Chưa chọn file, app sẽ dùng đường dẫn ở trên."}</p>
              </div>
              <p className="text-sm text-slate-500">
                App sẽ lấy mã khách hàng, tên, số điện thoại, địa chỉ, ghi chú và công nợ đầu kỳ từ file Excel.
              </p>
              <Button className="h-14 w-full text-2xl" disabled={isPending} onClick={submit}>
                {isPending ? "Đang import..." : "Import ngay"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
