"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, LayoutDashboard, ReceiptText, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const navigationItems = [
  { title: "Tổng quan", href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { title: "Khách hàng", href: "/customers", key: "customers", icon: Users },
  { title: "Nhà cung cấp", href: "/suppliers", key: "suppliers", icon: Truck },
  { title: "Hàng hóa", href: "/products", key: "products", icon: Boxes },
  { title: "Hóa đơn", href: "/orders", key: "orders", icon: ReceiptText },
  { title: "Nhập hàng", href: "/inventory", key: "inventory", icon: ShoppingBag },
  { title: "Thu / Chi", href: "/cashflow", key: "cashflow", icon: Wallet }
];

export function AppSidebar({ session }: { session: SessionUser }) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden min-h-screen w-80 shrink-0 border-r border-emerald-950 bg-[#03191f] text-white lg:flex lg:flex-col">
      <div className="border-b border-white/10 px-7 py-6">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💊</div>
          <div>
            <p className="text-4xl font-bold leading-none text-emerald-500">AAA888</p>
            <p className="mt-1 text-xl text-slate-400">Quản lý bán hàng</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-3 px-4 py-5">
        {navigationItems
          .filter((item) => canAccess(session.role, item.key))
          .map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "flex items-center gap-4 rounded-2xl px-5 py-4 text-[18px] font-semibold transition",
                  active ? "bg-[#132c31] text-emerald-500" : "text-slate-400 hover:bg-[#10272d] hover:text-white"
                )}
              >
                <Icon className="h-6 w-6" />
                {item.title}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
