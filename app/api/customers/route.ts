import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { nextCode } from "@/lib/order-service";
import { customerSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
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

    const code = parsed.data.code?.trim() || (await nextCode("KH", "customer"));
    const phone = parsed.data.phone?.trim() || `AUTO_PHONE_${code}`;

    const customer = await prisma.customer.create({
      data: {
        ...parsed.data,
        code,
        phone,
        email: parsed.data.email || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        groupId: parsed.data.groupId || null,
        openingDebt: 0,
        receivableDebt: 0,
      },
    });

    revalidateTag("customers-page");
    revalidateTag("pos-data");
    revalidatePath("/customers");
    revalidatePath("/pos");

    return NextResponse.json(customer);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "Mã khách hàng hoặc số điện thoại đã tồn tại" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo khách hàng" },
      { status: 500 }
    );
  }
}
