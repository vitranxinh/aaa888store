import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readInvoicePdf } from "@/lib/invoice-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        code: true,
        branchId: true,
        createdAt: true,
        pdfFileName: true
      }
    });

    if (!order || (session.branchId && order.branchId !== session.branchId)) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }

    if (!order.pdfFileName) {
      return NextResponse.json({ error: "Hóa đơn này chưa có PDF lưu trữ" }, { status: 404 });
    }

    const pdf = await readInvoicePdf({
      orderId: order.id,
      orderCode: order.code,
      createdAt: order.createdAt,
      pdfFileName: order.pdfFileName
    });

    return new NextResponse(Buffer.from(pdf.bytes), {
      headers: {
        "Content-Type": pdf.contentType,
        "Content-Length": String(pdf.contentLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(order.pdfFileName)}"`,
        "Cache-Control": "private, max-age=60"
      }
    });
  } catch (error) {
    console.error("[InvoicePdfReadError]", {
      orderId: params.id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể đọc PDF hóa đơn đã lưu" },
      { status: 500 }
    );
  }
}
