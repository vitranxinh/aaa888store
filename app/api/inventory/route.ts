import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inventoryAdjustmentSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
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
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const body = await request.json();
    const parsed = inventoryAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu điều chỉnh kho không hợp lệ" }, { status: 400 });
    }

    const payload = parsed.data;
    const { targetQuantity, ...transactionPayload } = payload;
    await prisma.$transaction(async (tx) => {
      const existingInventory = await tx.inventory.findFirst({
        where: { branchId: payload.branchId, productId: payload.productId, variantId: payload.variantId ?? null },
        select: { id: true, quantity: true }
      });

      const nextQuantity =
        payload.type === "ADJUSTMENT" && typeof targetQuantity === "number"
          ? targetQuantity
          : null;
      const adjustmentQuantity =
        payload.type === "ADJUSTMENT" && nextQuantity !== null && existingInventory
          ? nextQuantity - existingInventory.quantity
          : payload.quantity;
      const resultingQuantity = nextQuantity !== null ? nextQuantity : (existingInventory?.quantity ?? 0) + payload.quantity;

      if (resultingQuantity < 0) {
        throw new Error(`Tồn kho không được âm. Tồn hiện tại ${existingInventory?.quantity ?? 0}, thay đổi ${payload.quantity}.`);
      }

      if (existingInventory) {
        await tx.inventory.update({
          where: { id: existingInventory.id },
          data:
            nextQuantity !== null
              ? { quantity: nextQuantity }
              : { quantity: { increment: payload.quantity } }
        });
      } else {
        await tx.inventory.create({
          data: {
            branchId: payload.branchId,
            productId: payload.productId,
            variantId: payload.variantId ?? null,
            quantity: nextQuantity ?? payload.quantity,
            reservedQty: 0
          }
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          ...transactionPayload,
          quantity: adjustmentQuantity,
          createdById: actorUserId
        }
      });
    });

    revalidateTag("products-page");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể cập nhật tồn kho";
    const status = /UNAUTHORIZED|FORBIDDEN/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
