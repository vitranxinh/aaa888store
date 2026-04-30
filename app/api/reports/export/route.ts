import { NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type !== "sales") {
      return NextResponse.json({ error: "Loại export chưa hỗ trợ" }, { status: 400 });
    }

    const orders = await prisma.order.findMany({
      include: { customer: true, branch: true, createdBy: true },
      orderBy: { createdAt: "desc" }
    });

    const csv = stringify(
      orders.map((order) => ({
        code: order.code,
        branch: order.branch.name,
        customer: order.customer?.name ?? "Khách lẻ",
        createdBy: order.createdBy.name,
        status: order.status,
        paymentMethod: order.paymentMethod,
        grandTotal: Number(order.grandTotal),
        paidAmount: Number(order.paidAmount),
        debtAmount: Number(order.debtAmount),
        createdAt: order.createdAt.toISOString()
      })),
      { header: true }
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sales-report.csv"'
      }
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
