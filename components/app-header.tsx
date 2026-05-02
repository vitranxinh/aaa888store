import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";

export function AppHeader({ title, description, session }: { title: string; description: string; session: SessionUser }) {
  return (
    <header className="mb-6 flex min-h-[120px] flex-col justify-between gap-4 md:min-h-[112px] md:flex-row md:items-start lg:min-h-[132px]">
      <div className="min-h-[84px] flex-1 sm:min-h-[96px] lg:min-h-[112px]">
        <h2 className="min-h-[40px] text-[2rem] font-bold leading-[1.05] tracking-tight text-slate-900 sm:min-h-[48px] sm:text-[2.75rem] lg:min-h-[60px] lg:text-[3.5rem]">
          {title}
        </h2>
        <p className="mt-2 min-h-[24px] max-w-3xl text-base leading-6 text-slate-500 sm:min-h-[28px] sm:text-lg lg:min-h-[32px] lg:text-[1.35rem] lg:leading-8">
          {description}
        </p>
      </div>
      <div className="hidden min-h-[52px] items-center gap-3 lg:flex lg:self-start">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">{session.name}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{session.role}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button variant="outline" className="gap-2">
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </form>
      </div>
    </header>
  );
}
