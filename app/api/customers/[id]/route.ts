import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu khách hàng không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.customer.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }

    const duplicate = await prisma.customer.findFirst({
      where: {
        id: { not: params.id },
        OR: [{ code: parsed.data.code }, { phone: parsed.data.phone }],
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({ error: "Mã khách hàng hoặc số điện thoại đã tồn tại" }, { status: 400 });
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        groupId: parsed.data.groupId || null,
        openingDebt: parsed.data.openingDebt ?? 0,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật khách hàng" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);

    const existing = await prisma.customer.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            orders: true,
            cashTxns: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }

    if (existing._count.orders > 0 || existing._count.cashTxns > 0) {
      return NextResponse.json(
        { error: "Khách hàng đã phát sinh hóa đơn hoặc thu/chi, không thể xóa." },
        { status: 400 }
      );
    }

    await prisma.customer.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ ok: true, name: existing.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa khách hàng" },
      { status: 500 }
    );
  }
}
