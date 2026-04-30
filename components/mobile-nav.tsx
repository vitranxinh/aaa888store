"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigationItems } from "@/components/app-sidebar";
import type { SessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function MobileNav({ session }: { session: SessionUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const quickItems = navigationItems
    .filter(
      (item) =>
        canAccess(session.role, item.key) &&
        ["dashboard", "customers", "products", "orders"].includes(item.key)
    );

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-emerald-700 bg-emerald-600 text-white shadow-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-[1.75rem] font-bold leading-none">AAA888</p>
            <p className="mt-1 text-[0.95rem] text-emerald-50/90">Quản lý trên điện thoại</p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/auth/logout" method="post">
              <Button
                variant="outline"
                className="h-12 rounded-full border-white/30 bg-white/10 px-4 text-base font-semibold text-white hover:bg-white/20"
              >
                <LogOut className="mr-2 h-5 w-5" />
                Thoát
              </Button>
            </form>
            <Button variant="outline" className="h-12 w-12 rounded-full border-white/30 bg-white/10 p-0 text-white hover:bg-white/20" onClick={() => setOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-sm bg-[#03191f] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xl font-bold text-emerald-500">AAA888</p>
                <p className="text-sm text-slate-400">Quản lý bán hàng</p>
              </div>
              <Button variant="ghost" className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/10" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="space-y-2 px-3 py-4">
              {navigationItems
                .filter((item) => canAccess(session.role, item.key))
                .map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3.5 text-lg font-semibold transition",
                        active ? "bg-[#132c31] text-emerald-500" : "text-slate-300 hover:bg-[#10272d] hover:text-white"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.title}
                    </Link>
                  );
                })}
            </nav>

            <div className="mt-auto border-t border-white/10 px-4 py-4">
              <div className="mb-4">
                <p className="text-sm font-medium text-white">{session.name}</p>
                <p className="text-xs uppercase tracking-wide text-slate-400">{session.role}</p>
              </div>
              <form action="/api/auth/logout" method="post">
                <Button variant="outline" className="w-full justify-center gap-2 border-white/20 bg-transparent text-white hover:bg-white/10">
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/98 px-2 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-4 gap-1">
          {quickItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-[14px] font-semibold",
                  active ? "bg-emerald-50 text-emerald-600" : "text-slate-500"
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="line-clamp-1">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
