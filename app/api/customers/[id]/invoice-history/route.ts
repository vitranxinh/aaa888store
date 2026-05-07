import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { buildCustomerInvoiceHistoryWhere, resolveCustomerHistoryFilters } from "@/lib/customer-debt";
import { prisma } from "@/lib/prisma";

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

    const startedAt = Date.now();
    const rows = await prisma.order.findMany({
      where: buildCustomerInvoiceHistoryWhere(params.id, filters),
      select: {
        id: true,
        code: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        debtAmount: true,
        status: true,
        note: true
      },
      orderBy: { createdAt: "desc" }
    });

    console.info("[CustomerDebtPerformance][invoice-history-api]", {
      customerId: params.id,
      count: rows.length,
      totalMs: Date.now() - startedAt
    });

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        grandTotal: Number(row.grandTotal),
        paidAmount: Number(row.paidAmount),
        debtAmount: Number(row.debtAmount)
      }))
    );
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
