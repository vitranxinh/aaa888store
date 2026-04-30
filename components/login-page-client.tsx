"use client";

import { useState } from "react";
import { loginSchema } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toast-store";

export function LoginPageClient() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("admin@soban.vn");
  const [password, setPassword] = useState("12345678");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const pushToast = useToastStore((state) => state.push);

  async function onSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      const nextErrors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") nextErrors.email = issue.message;
        if (issue.path[0] === "password") nextErrors.password = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data)
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
      let nextPath = "/dashboard";

      if (callbackUrl) {
        try {
          const callback = new URL(callbackUrl, window.location.origin);
          nextPath = `${callback.pathname}${callback.search}${callback.hash}`;
        } catch {
          nextPath = "/dashboard";
        }
      }

      window.location.assign(`${window.location.origin}${nextPath}`);
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
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">AAA888</p>
        <CardTitle className="mt-3 text-3xl">Đăng nhập hệ thống</CardTitle>
        <CardDescription className="mt-2">
          POS và ERP cho cửa hàng bán lẻ, chuỗi nhỏ và nhà thuốc, tạp hóa, mỹ phẩm, phụ kiện.
        </CardDescription>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              autoComplete="username"
            />
            {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="current-password"
            />
            {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password}</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
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
