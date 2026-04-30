import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { supplierSchema } from "@/lib/validations";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = supplierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu nhà cung cấp không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.supplier.findUnique({
      where: { id: params.id },
      select: { id: true }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });
    }

    const duplicate = await prisma.supplier.findFirst({
      where: {
        id: { not: params.id },
        OR: [
          { code: parsed.data.code },
          ...(parsed.data.phone ? [{ phone: parsed.data.phone }] : [])
        ]
      },
      select: { id: true }
    });

    if (duplicate) {
      return NextResponse.json({ error: "Mã NCC hoặc số điện thoại đã tồn tại" }, { status: 400 });
    }

    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        openingDebt: parsed.data.openingDebt
      }
    });

    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật nhà cung cấp" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);

    const existing = await prisma.supplier.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            purchaseOrders: true,
            cashTxns: true
          }
        }
      }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });
    }

    if (existing._count.purchaseOrders > 0 || existing._count.cashTxns > 0) {
      return NextResponse.json(
        { error: "Nhà cung cấp đã phát sinh phiếu nhập hoặc thu/chi, không thể xóa." },
        { status: 400 }
      );
    }

    await prisma.supplier.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ ok: true, name: existing.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa nhà cung cấp" },
      { status: 500 }
    );
  }
}
