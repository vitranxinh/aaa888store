import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const customers = await prisma.customer.findMany({
      include: { group: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(customers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu khách hàng không hợp lệ" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        ...parsed.data,
        email: parsed.data.email || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        groupId: parsed.data.groupId || null,
        openingDebt: 0,
        receivableDebt: 0,
      },
    });

    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
