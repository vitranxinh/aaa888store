import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inventoryAdjustmentSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const items = await prisma.inventory.findMany({
      include: { branch: true, product: true, variant: true },
      orderBy: { updatedAt: "desc" }
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER"]);
    const body = await request.json();
    const parsed = inventoryAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu điều chỉnh kho không hợp lệ" }, { status: 400 });
    }

    const payload = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.inventory.updateMany({
        where: { branchId: payload.branchId, productId: payload.productId, variantId: payload.variantId },
        data: { quantity: { increment: payload.quantity } }
      });
      await tx.inventoryTransaction.create({
        data: {
          ...payload,
          createdById: session.id
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
