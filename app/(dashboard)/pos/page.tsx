import { PosScreen } from "@/components/pos-screen";
import { getPosData } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export default async function PosPage() {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const data = await getPosData(session.branchId ?? undefined);

  return <PosScreen data={data} defaultBranchId={session.branchId} />;
}
