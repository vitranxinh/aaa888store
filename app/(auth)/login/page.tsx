"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const pushToast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@soban.vn", password: "12345678" }
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });

      const text = await response.text();
      const isJson = (response.headers.get("content-type") || "").includes("application/json");
      const payload = isJson ? (text ? JSON.parse(text) : {}) : { error: text.slice(0, 300) || "Server trả về dữ liệu không hợp lệ" };

      if (!response.ok) {
        pushToast({ title: "Đăng nhập thất bại", description: payload.error ?? "Không thể đăng nhập", variant: "error" });
        return;
      }

      pushToast({ title: "Đăng nhập thành công", description: "Đang chuyển vào dashboard" });
      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      window.location.href = callbackUrl || "/dashboard";
    } catch (error) {
      pushToast({
        title: "Đăng nhập thất bại",
        description: error instanceof Error ? error.message : "Lỗi không xác định",
        variant: "error"
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_28%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4">
      <Card className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">SoBan Retail</p>
        <CardTitle className="mt-3 text-3xl">Đăng nhập hệ thống</CardTitle>
        <CardDescription className="mt-2">
          POS và ERP cho cửa hàng bán lẻ, chuỗi nhỏ và nhà thuốc, tạp hóa, mỹ phẩm, phụ kiện.
        </CardDescription>

        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <Input {...form.register("email")} />
            {form.formState.errors.email ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <Input type="password" {...form.register("password")} />
            {form.formState.errors.password ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p> : null}
          </div>
          <Button className="w-full" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Tài khoản mẫu</p>
          <p className="mt-2">Admin: `admin@soban.vn` / `12345678`</p>
          <p>Manager: `manager@soban.vn` / `12345678`</p>
          <p>Cashier: `cashier@soban.vn` / `12345678`</p>
        </div>
      </Card>
    </main>
  );
}
