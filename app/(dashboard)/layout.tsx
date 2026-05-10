import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-slate-50">
      <AppSidebar session={session} />
      <div className="mobile-safe-bottom flex-1 max-w-full overflow-x-hidden">
        <MobileNav session={session} />
        <div className="max-w-full overflow-x-hidden px-4 py-4 sm:px-5 sm:py-5 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
