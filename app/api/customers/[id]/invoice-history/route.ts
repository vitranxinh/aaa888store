import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getCustomerInvoiceHistory, resolveCustomerHistoryFilters } from "@/lib/customer-debt";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const { searchParams } = new URL(request.url);
    const filters = resolveCustomerHistoryFilters({
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      status: searchParams.get("status") ?? "all",
      code: searchParams.get("code") ?? "",
      history: searchParams.get("history") ?? ""
    });

    const rows = await getCustomerInvoiceHistory(params.id, filters);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[CustomerDebtError][invoice-history-api]", {
      customerId: params.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tải lịch sử hóa đơn" },
      { status: 500 }
    );
  }
}
