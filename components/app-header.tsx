import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";

export function AppHeader({ title, description, session }: { title: string; description: string; session: SessionUser }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h2 className="text-[2.25rem] font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">{title}</h2>
        <p className="mt-2 text-base text-slate-500 sm:text-lg lg:text-2xl">{description}</p>
      </div>
      <div className="hidden items-center gap-3 lg:flex">
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
