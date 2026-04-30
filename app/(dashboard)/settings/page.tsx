import { Card } from "@/components/ui/card";
import { rolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export default async function SettingsPage() {
  await requireSession(["ADMIN"]);
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-base font-semibold text-slate-900">Hồ sơ cửa hàng</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {branches.map((branch) => (
            <div key={branch.id} className="rounded-2xl border border-slate-100 p-4">
              <p className="font-medium text-slate-900">{branch.name}</p>
              <p className="mt-1 text-sm text-slate-500">{branch.address}</p>
              <p className="text-sm text-slate-500">{branch.phone}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-900">Quyền theo vai trò</h3>
        <div className="mt-4 space-y-4">
          {Object.entries(rolePermissions).map(([role, permissions]) => (
            <div key={role} className="rounded-2xl border border-slate-100 p-4">
              <p className="font-medium text-slate-900">{role}</p>
              <p className="mt-2 text-sm text-slate-500">{permissions.join(", ")}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-900">Thiết lập hóa đơn và tiền tệ</h3>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Tiền tệ mặc định: VND</li>
          <li>Locale ngày giờ: vi-VN</li>
          <li>Có thể mở rộng thêm mẫu hóa đơn VAT, cấu hình thuế và mẫu in POS</li>
        </ul>
      </Card>
    </div>
  );
}
