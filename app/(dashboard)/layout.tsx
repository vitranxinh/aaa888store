import { headers } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const pathname = headers().get("x-pathname") ?? "";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar pathname={pathname} session={session} />
      <div className="flex-1 p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
