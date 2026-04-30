import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar session={session} />
      <div className="flex-1 pb-24 lg:pb-0">
        <MobileNav session={session} />
        <div className="p-4 sm:p-5 lg:p-8">
        {children}
        </div>
      </div>
    </div>
  );
}
