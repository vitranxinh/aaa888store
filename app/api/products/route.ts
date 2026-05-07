import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { productCreateSchema } from "@/lib/validations";

async function generateProductSku() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `SP${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const existing = await prisma.product.findUnique({
      where: { sku: candidate },
      select: { id: true }
    });

    if (!existing) return candidate;
  }

  return `SP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function GET() {
  try {
    await requireApiSession(["ADMIN", "MANAGER"]);
    const products = await prisma.product.findMany({
      include: { category: true, brand: true, variants: true, inventories: true },
      orderBy: { updatedAt: "desc" }
    });
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo sản phẩm" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const productInput = {
      name: body.name,
      sku: body.sku || (await generateProductSku()),
      imageUrl: body.imageUrl || "",
      categoryId: body.categoryId || "",
      brandId: body.brandId || "",
      sellingPrice: typeof body.sellingPrice === "number" ? body.sellingPrice : Number(body.sellingPrice ?? 0),
      initialStockQuantity: typeof body.initialStockQuantity === "number" ? body.initialStockQuantity : Number(body.initialStockQuantity ?? 0),
      stockBranchId: body.stockBranchId || "",
      batchNumber: body.batchNumber || "",
      stockDate: body.stockDate || "",
      stockNote: body.stockNote || ""
    };
    const parsed = productCreateSchema.safeParse(productInput);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu sản phẩm không hợp lệ" }, { status: 400 });
    }
    const resolvedSku = parsed.data.sku || productInput.sku;
    const slug = `${parsed.data.name}-${resolvedSku}`.toLowerCase().replace(/\//g, "-").replace(/ /g, "-").replace(/-+/g, "-");
    const branchId =
      parsed.data.initialStockQuantity > 0
        ? parsed.data.stockBranchId || session.branchId || (await prisma.branch.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: { id: true }
          }))?.id || ""
        : "";
    const actorUserId = parsed.data.initialStockQuantity > 0 ? await resolveActorUserId(session) : null;

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          name: parsed.data.name,
          slug,
          sku: resolvedSku,
          barcode: null,
          imageUrl: parsed.data.imageUrl || null,
          categoryId: parsed.data.categoryId || null,
          brandId: parsed.data.brandId || null,
          costPrice: 0,
          sellingPrice: parsed.data.sellingPrice,
          lowStockAlert: 10,
          status: "ACTIVE",
          description: null
        }
      });

      if (parsed.data.initialStockQuantity > 0 && branchId) {
        const inventory = await tx.inventory.findFirst({
          where: { branchId, productId: createdProduct.id, variantId: null },
          select: { id: true }
        });

        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: { increment: parsed.data.initialStockQuantity } }
          });
        } else {
          await tx.inventory.create({
            data: {
              branchId,
              productId: createdProduct.id,
              variantId: null,
              quantity: parsed.data.initialStockQuantity,
              reservedQty: 0
            }
          });
        }

        let batchId: string | undefined;
        if (parsed.data.batchNumber) {
          const batch = await tx.productBatch.create({
            data: {
              branchId,
              productId: createdProduct.id,
              batchNumber: parsed.data.batchNumber.trim(),
              expiryDate: null,
              quantity: parsed.data.initialStockQuantity,
              importPrice: 0
            },
            select: { id: true }
          });
          batchId = batch.id;
        }

        await tx.inventoryTransaction.create({
          data: {
            branchId,
            productId: createdProduct.id,
            variantId: null,
            batchId,
            type: "IMPORT",
            quantity: parsed.data.initialStockQuantity,
            note: parsed.data.stockNote?.trim() || "Nhập tồn ban đầu khi tạo sản phẩm",
            referenceCode: createdProduct.sku,
            createdById: actorUserId ?? undefined,
            createdAt: parsed.data.stockDate ? new Date(parsed.data.stockDate) : undefined
          }
        });
      }

      return createdProduct;
    });
    revalidateTag("products-page");
    revalidateTag("pos-data");
    revalidatePath("/products");
    revalidatePath("/pos");
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
