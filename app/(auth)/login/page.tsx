import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; callbackUrl?: string };
}) {
  const error = searchParams?.error ?? "";
  const callbackUrl = searchParams?.callbackUrl ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_28%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4">
      <Card className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">AAA888</p>
        <CardTitle className="mt-3 text-3xl">Đăng nhập hệ thống</CardTitle>
        <CardDescription className="mt-2">
          POS và ERP cho cửa hàng bán lẻ, chuỗi nhỏ và nhà thuốc, tạp hóa, mỹ phẩm, phụ kiện.
        </CardDescription>

        <form className="mt-6 space-y-4" method="post" action="/api/auth/login">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              name="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <Input
              type="password"
              name="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-white transition hover:bg-teal-700">
            Đăng nhập
          </button>
        </form>
      </Card>
    </main>
  );
}
